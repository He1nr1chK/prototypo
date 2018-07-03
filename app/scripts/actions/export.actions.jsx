/* global URL */
import gql from 'graphql-tag';
import JSZip from 'jszip';

import {
	prototypoStore,
	undoableStore,
	fontInstanceStore,
} from '../stores/creation.stores';
import LocalServer from '../stores/local-server.stores';
import LocalClient from '../stores/local-client.stores';
import {FontValues} from '../services/values.services';
import HoodieApi from '../services/hoodie.services';
import FontMediator from '../prototypo.js/mediator/FontMediator';
import apolloClient from '../services/graphcool.services';

let localServer;
let localClient;
let exportingError;

window.addEventListener('fluxServer.setup', () => {
	localClient = LocalClient.instance();
	localServer = LocalServer.instance;
});

const a = document.createElement('a');

function triggerDownload(arrayBuffer, filename) {
	const reader = new FileReader();
	const enFamilyName = filename;

	reader.onloadend = () => {
		a.download = enFamilyName;
		a.href = reader.result;
		a.dispatchEvent(new MouseEvent('click'));

		setTimeout(() => {
			a.href = '#';
			URL.revokeObjectURL(reader.result);
		}, 100);
	};

	reader.readAsDataURL(
		new Blob([new DataView(arrayBuffer)], {type: 'font/opentype'}),
	);
}

/**
 *	Checks for export authorization for a given (plan,credits) couple
 *	@param {string} the current user's plan
 *	@param {number} the current user's credit amount
 *	@return {boolean} wether the user is authorized to export or not
 */
function exportAuthorized(plan, credits) {
	const currentCreditCost = prototypoStore.get('currentCreditCost');
	const paidPlan = plan.indexOf('free_') === -1;
	const enoughCredits = credits && credits > 0 && currentCreditCost <= credits;

	if (!paidPlan && !enoughCredits) {
		localClient.dispatchAction('/store-value', {
			errorExport: {
				message: 'Not enough credits',
			},
		});
	}

	return paidPlan || enoughCredits;
}

/**
 *	Dispatches an event that will spend credits (to be done on export success callback)
 */
function spendCreditsAction() {
	const plan = HoodieApi.instance.plan;

	if (plan.indexOf('free_') !== -1) {
		const currentCreditCost = prototypoStore.get('currentCreditCost');

		localClient.dispatchAction('/spend-credits', {
			amount: currentCreditCost,
		});
	}
}

export default {
	'/exporting': ({exporting, errorExport}) => {
		const patch = prototypoStore
			.set('export', exporting)
			.set('errorExport', errorExport)
			.commit();

		localServer.dispatchUpdate('/prototypoStore', patch);
	},
	'/export-otf': async ({
		merged = true,
		familyName = 'font',
		variantName = 'regular',
		exportAs,
	}) => {
		const exporting = prototypoStore.get('export');

		if (exporting) {
			return;
		}

		const plan = HoodieApi.instance.plan;
		const credits = prototypoStore.get('credits');

		// forbid export without plan
		if (!exportAuthorized(plan, credits)) {
			return;
		}

		localClient.dispatchAction('/exporting', {exporting: true});

		exportingError = setTimeout(() => {
			localClient.dispatchAction('/exporting', {
				exporting: false,
				errorExport: true,
			});
		}, 10000);

		let family;
		let style;

		if (exportAs) {
			family = familyName;
			style = variantName;
		}
		else {
			family = prototypoStore.get('family').name
				? prototypoStore.get('family').name.replace(/\s/g, '-')
				: familyName;
			style = prototypoStore.get('variant').name
				? prototypoStore.get('variant').name.replace(/\s/g, '-')
				: variantName;
		}

		const name = {
			family,
			style: `${style.toLowerCase()}`,
		};

		const fontMediatorInstance = FontMediator.instance();
		const values = undoableStore.get('controlsValues');
		const template = fontInstanceStore.get('templateToLoad');
		const glyphs = prototypoStore.get('glyphs');
		const subset = Object.keys(glyphs).filter(
			key => glyphs[key][0].unicode !== undefined,
		);

		try {
			const buffer = await fontMediatorInstance.getFontFile(
				name,
				template,
				{...values},
				subset,
			);

			triggerDownload(buffer, `${name.family} ${name.style}.otf`);
			localClient.dispatchAction('/exporting', {exporting: false});
			localClient.dispatchAction('/end-export-otf');
		}
		catch (e) {
			localClient.dispatchAction('/end-export-otf');
		}
	},
	'/export-otf-from-library': async ({
		merged = true,
		familyName = 'font',
		variantName = 'regular',
		values,
		template,
		glyphs,
		designer,
		designerUrl,
		foundry,
		foundryUrl,
		weight,
		width,
		italic,
	}) => {
		const exporting = prototypoStore.get('export');

		if (exporting) {
			console.log('Already exporting, sorry!');
			return;
		}

		const plan = HoodieApi.instance.plan;
		const credits = prototypoStore.get('credits');

		// forbid export without plan
		if (!exportAuthorized(plan, credits)) {
			console.log('You need a plan to export');
			localClient.dispatchAction('/store-value', {
				openRestrictedFeature: true,
				restrictedFeatureHovered: 'export',
			});
			return;
		}

		localClient.dispatchAction('/exporting', {exporting: true});

		exportingError = setTimeout(() => {
			localClient.dispatchAction('/exporting', {
				exporting: false,
				errorExport: true,
			});
			console.log('Export timed out');
		}, 10000);

		const family = familyName.replace(/\s/g, '-');
		const style = variantName.replace(/\s/g, '-');

		const name = {
			family,
			style: `${style.toLowerCase()}`,
		};

		const fontMediatorInstance = FontMediator.instance();
		const subset = Object.keys(glyphs).filter(
			key => glyphs[key][0].unicode !== undefined,
		);

		try {
			const buffer = await fontMediatorInstance.getFontFile(
				name,
				template,
				{...values},
				subset,
				designer,
				designerUrl,
				foundry,
				foundryUrl,
				weight,
				width,
				italic,
			);

			triggerDownload(buffer, `${name.family} ${name.style}.otf`);
			localClient.dispatchAction('/exporting', {exporting: false});
			localClient.dispatchAction('/end-export-otf');
		}
		catch (e) {
			localClient.dispatchAction('/end-export-otf');
		}
	},
	'/export-family-from-library': async ({
		familyName = 'font',
		variantNames,
		valueArray,
		metadataArray,
		template,
		glyphs,
		designer,
		designerUrl,
		foundry,
		foundryUrl,
	}) => {
		const exporting = prototypoStore.get('export');

		if (exporting) {
			console.log('Already exporting, sorry!');
			return;
		}

		const plan = HoodieApi.instance.plan;
		const credits = prototypoStore.get('credits');

		// forbid export without plan
		if (!exportAuthorized(plan, credits)) {
			localClient.dispatchAction('/store-value', {
				openRestrictedFeature: true,
				restrictedFeatureHovered: 'export',
			});
			console.log('You need a plan to export');
			return;
		}

		localClient.dispatchAction('/exporting', {exporting: true});

		exportingError = setTimeout(() => {
			console.log('Export timed out');
			localClient.dispatchAction('/exporting', {
				exporting: false,
				errorExport: true,
			});
		}, 25000);

		const promiseArray = [];
		const fontMediatorInstance = FontMediator.instance();
		const subset = Object.keys(glyphs).filter(
			key => glyphs[key][0].unicode !== undefined,
		);

		variantNames.forEach((variantName, index) => {
			console.log(`exporting ${variantName} number ${index}`);
			promiseArray.push(
				new Promise((resolve, reject) => {
					const family = familyName.replace(/\s/g, '-');
					const style = variantName
						? variantName.replace(/\s/g, '-')
						: 'regular';
					const name = {
						family,
						style: `${style.toLowerCase()}`,
					};

					console.log('getting font file');
					fontMediatorInstance
						.getFontFile(
							name,
							template,
							{...valueArray[index]},
							subset,
							designer,
							designerUrl,
							foundry,
							foundryUrl,
							metadataArray[index].weight,
							metadataArray[index].width,
							metadataArray[index].italic,
						)
						.then((buffer) => {
							console.log(`${variantName} Buffer recieved!`);
							resolve(buffer);
						})
						.catch((e) => {
							console.log(e);
							reject(e);
						});
				}),
			);
		});
		const zip = new JSZip();

		Promise.all(promiseArray)
			.then((blobBuffers) => {
				console.log('All buffers recieved, exporting zip file');
				blobBuffers.forEach((buffer, index) => {
					const variantName = variantNames[index]
						? variantNames[index].replace(/\s/g, '-').toLowerCase()
						: 'regular';
					const variantPatch = prototypoStore
						.set('exportedVariant', prototypoStore.get('exportedVariant') + 1)
						.commit();

					localServer.dispatchUpdate('/prototypoStore', variantPatch);
					zip.file(
						`${familyName.replace(/\s/g, '-')} ${variantName}.otf`,
						buffer,
						{binary: true},
					);
				});
				const reader = new FileReader();

				reader.onloadend = () => {
					const dl = document.createElement('a');
					const URL = window.URL || window.webkitURL;

					dl.download = `${familyName.replace(/\s/g, '-')}.zip`;
					dl.href = reader.result;
					clearTimeout(exportingError);
					dl.dispatchEvent(new MouseEvent('click'));
					setTimeout(() => {
						dl.href = '#';
						URL.revokeObjectURL(reader.result);
						localClient.dispatchAction('/exporting', {
							exporting: false,
						});
						localClient.dispatchAction('/end-export-otf');
					}, 500);
				};
				reader.readAsDataURL(zip.generate({type: 'blob'}));
			})
			.catch((e) => {
				console.log('An error occured');
				console.log(e);
				localClient.dispatchAction('/end-export-otf');
			});
	},
	'/end-export-otf': () => {
		console.log('Export finished');
		localClient.dispatchAction('/store-value-font', {exportPlease: false});
		localClient.dispatchAction('/store-value', {uiOnboardstep: 'end'});
		clearTimeout(exportingError);
		window.Intercom('trackEvent', 'export-otf');
		spendCreditsAction();
		localClient.dispatchAction('/exporting', {exporting: false});
	},
	'/set-up-export-otf': ({merged, exportAs = true}) => {
		const plan = HoodieApi.instance.plan;
		const credits = prototypoStore.get('credits');

		// forbid export without plan
		if (!exportAuthorized(plan, credits)) {
			return false;
		}

		const patch = prototypoStore
			.set('exportAs', exportAs)
			.set('mergedExportAs', merged)
			.commit();

		localServer.dispatchUpdate('/prototypoStore', patch);
	},
	'/export-glyphr': async () => {
		const exporting = prototypoStore.get('export');

		if (exporting) {
			return;
		}

		const plan = HoodieApi.instance.plan;
		const credits = prototypoStore.get('credits');

		// forbid export without plan
		if (!exportAuthorized(plan, credits)) {
			return;
		}

		localClient.dispatchAction('/exporting', {exporting: true});

		exportingError = setTimeout(() => {
			localClient.dispatchAction('/exporting', {
				exporting: false,
				errorExport: true,
			});
		}, 10000);

		const family = prototypoStore.get('family').name.replace(/\s/g, '-');
		const style = prototypoStore.get('variant').name.replace(/\s/g, '-');

		const name = {
			family,
			style: `${style.toLowerCase()}`,
		};

		const fontMediatorInstance = FontMediator.instance();
		const altList = prototypoStore.get('altList');
		const values = undoableStore.get('controlsValues');
		const template = fontInstanceStore.get('templateToLoad');
		const glyphs = prototypoStore.get('glyphs');
		const subset = Object.keys(glyphs).filter(
			key => glyphs[key][0].unicode !== undefined,
		);

		try {
			await fontMediatorInstance.openInGlyphr(
				name,
				template,
				{...values, altList},
				subset,
			);

			localClient.dispatchAction('/exporting', {exporting: false});
			localClient.dispatchAction('/end-export-otf');
		}
		catch (e) {
			localClient.dispatchAction('/end-export-otf');
		}
	},
	// TODO add a spend credit action
	'/export-family-from-reader': ({result, familyToExport, template, oldDb}) => {
		const a = document.createElement('a');
		const _URL = window.URL || window.webkitURL;

		a.download = `${familyToExport.name}.zip`;
		a.href = result;
		a.dispatchEvent(new MouseEvent('click'));

		setTimeout(() => {
			a.href = '#';
			_URL.revokeObjectURL(result);
		}, 100);

		fontInstance.exportingZip = false;

		localClient.dispatchAction('/change-font', {
			templateToLoad: template,
			db: oldDb,
		});

		const cleanupPatch = prototypoStore
			.set('variantToExport', undefined)
			.set('exportedVariant', 0)
			.set('familyExported', undefined)
			.commit();

		localServer.dispatchUpdate('/prototypoStore', cleanupPatch);
	},
	'/export-family-from-blob': ({
		familyToExport,
		oldDb,
		blobBuffers,
		template,
	}) => {
		const zip = new JSZip();

		blobBuffers.forEach(({buffer, variant}) => {
			const variantPatch = prototypoStore
				.set('exportedVariant', prototypoStore.get('exportedVariant') + 1)
				.commit();

			localServer.dispatchUpdate('/prototypoStore', variantPatch);
			zip.file(`${variant}.otf`, buffer, {binary: true});
		});
		const reader = new FileReader();

		reader.onloadend = () => {
			localClient.dispatchAction('/export-family-from-reader', {
				result: reader.result,
				familyToExport,
				template,
				oldDb,
			});
		};

		reader.readAsDataURL(zip.generate({type: 'blob'}));
	},
	'/export-family-from-values': ({
		familyToExport,
		valueArray,
		oldDb,
		template,
	}) => {
		const blobs = [];

		valueArray.forEach((value) => {
			const blob = fontInstance.getBlob(
				null,
				{
					family: familyToExport.name,
					style: value.currVariant.name,
				},
				false,
				value.fontValues.values,
			);

			blobs.push(blob.then(blobContent => blobContent));
		});

		Promise.all(blobs).then((blobBuffers) => {
			localClient.dispatchAction('/export-family-from-blob', {
				familyToExport,
				oldDb,
				blobBuffers,
				template,
			});
		});
	},
	'/end-export-glyphr': () => {
		spendCreditsAction();
	},
	// TODO add a spend credit action
	'/export-family-from-reader': ({result, familyToExport, template, oldDb}) => {
		const a = document.createElement('a');
		const _URL = window.URL || window.webkitURL;

		a.download = `${familyToExport.name}.zip`;
		a.href = result;
		a.dispatchEvent(new MouseEvent('click'));

		setTimeout(() => {
			a.href = '#';
			_URL.revokeObjectURL(result);
		}, 100);

		fontInstance.exportingZip = false;

		localClient.dispatchAction('/change-font', {
			templateToLoad: template,
			db: oldDb,
		});

		const cleanupPatch = prototypoStore
			.set('variantToExport', undefined)
			.set('exportedVariant', 0)
			.set('familyExported', undefined)
			.commit();

		localServer.dispatchUpdate('/prototypoStore', cleanupPatch);
	},
	'/export-family-from-blob': ({
		familyToExport,
		oldDb,
		blobBuffers,
		template,
	}) => {
		const zip = new JSZip();

		blobBuffers.forEach(({buffer, variant}) => {
			const variantPatch = prototypoStore
				.set('exportedVariant', prototypoStore.get('exportedVariant') + 1)
				.commit();

			localServer.dispatchUpdate('/prototypoStore', variantPatch);
			zip.file(`${variant}.otf`, buffer, {binary: true});
		});
		const reader = new FileReader();

		reader.onloadend = () => {
			localClient.dispatchAction('/export-family-from-reader', {
				result: reader.result,
				familyToExport,
				template,
				oldDb,
			});
		};

		reader.readAsDataURL(zip.generate({type: 'blob'}));
	},
	'/export-family-from-values': ({
		familyToExport,
		valueArray,
		oldDb,
		template,
	}) => {
		const blobs = [];

		valueArray.forEach((value) => {
			const blob = fontInstance.getBlob(
				null,
				{
					family: familyToExport.name,
					style: value.currVariant.name,
				},
				false,
				value.fontValues.values,
			);

			blobs.push(blob.then(blobContent => blobContent));
		});

		Promise.all(blobs).then((blobBuffers) => {
			localClient.dispatchAction('/export-family-from-blob', {
				familyToExport,
				oldDb,
				blobBuffers,
				template,
			});
		});
	},
	'/export-family-after-load': ({
		familyToExport,
		variants,
		oldDb,
		template,
	}) => {
		const values = [];

		for (let i = 0; i < variants.length; i++) {
			const currVariant = variants[i];

			values.push(
				FontValues.get({
					typeface: currVariant.db,
					variantId: currVariant.id,
				}).then(fontValues => ({
					currVariant,
					fontValues,
				})),
			);
		}

		Promise.all(values).then((valueArray) => {
			localClient.dispatchAction('/export-family-from-values', {
				familyToExport,
				valueArray,
				oldDb,
				template,
			});
		});
	},
	'/export-family': async ({familyToExport, variants}) => {
		const exporting = prototypoStore.get('export');

		if (exporting) {
			return;
		}

		const plan = HoodieApi.instance.plan;
		const credits = prototypoStore.get('credits');

		// forbid export without plan
		if (!exportAuthorized(plan, credits)) {
			return;
		}

		const selectedVariant = prototypoStore.get('variant');
		const selectedFamily = prototypoStore.get('family');
		const {data: {family}} = await apolloClient.query({
			query: gql`
				query getFamilyValues($id: ID!) {
					family: Family(id: $id) {
						name
						variants {
							id
							name
							values
						}
					}
				}
			`,
			variables: {id: selectedFamily.id},
		});

		if (!family) {
			localClient.dispatchAction('/exporting', {
				exporting: false,
				errorExport: true,
			});
			return;
		}

		const blobs = family.variants.map((variant) => {
			const blob = {}; // TODO: build each font from variant.values

			return blob.then(blobContent => blobContent);
		});

		Promise.all(blobs).then((blobBuffers) => {
			const zip = new JSZip();

			blobBuffers.forEach(({buffer, variant}) => {
				const variantPatch = prototypoStore
					.set('exportedVariant', prototypoStore.get('exportedVariant') + 1)
					.commit();

				localServer.dispatchUpdate('/prototypoStore', variantPatch);
				zip.file(`${variant}.otf`, buffer, {binary: true});
			});
			const reader = new FileReader();

			reader.onloadend = () => {
				const a = document.createElement('a');

				a.download = `${family.name}.zip`;
				a.href = reader.result;
				a.click();
			};

			reader.readAsDataURL(zip.generate({type: 'blob'}));
		});
	},
};
