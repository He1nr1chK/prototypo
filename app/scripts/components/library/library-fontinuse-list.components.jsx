import React from 'react';
import {Link} from 'react-router';
import {LibrarySidebarRight} from './library-sidebars.components';

const isUrl = new RegExp(
	'^(https?:\\/\\/)?'
		+ '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'
		+ '((\\d{1,3}\\.){3}\\d{1,3}))'
		+ '(\\:\\d+)?'
		+ '(\\/[-a-z\\d%@_.~+&:]*)*'
		+ '(\\?[;&a-z\\d%@_.,~+&:=-]*)?'
		+ '(\\#[-a-z\\d_]*)?$',
	'i',
);

export default class LibraryFontsInUseList extends React.Component {
	constructor(props) {
		super(props);
		this.state = {};
	}
	renderFont(fontUsed) {
		switch (fontUsed.type) {
		case 'Template':
			return <span className="library-fontinuse-font">{fontUsed.name}</span>;
		case 'Preset':
			return <span className="library-fontinuse-font">{fontUsed.name}</span>;
		case 'Family':
			return (
				<span className="library-fontinuse-font">
					<Link to={`/library/project/${fontUsed.family.id}`}>
						{fontUsed.name}
					</Link>
				</span>
			);
		default:
			return false;
		}
	}
	render() {
		return (
			<div className="library-content-wrapper">
				<div className="library-see">
					<div className="library-see-title">Fonts in use</div>
					<div className="library-fontinuse-list">
						{this.props.fontInUses
							&& this.props.fontInUses.map(fontInUse => (
								<div className="library-fontinuse">
									<div className="library-fontinuse-left">
										{fontInUse.images.map(image => (
											<img src={`${image.replace('files.', 'images.')}/800x`} />
										))}
									</div>
									<div className="library-fontinuse-right">
										<p>
											<label>Client</label>
											{isUrl.test(fontInUse.clientUrl) ? (
												<a href={fontInUse.clientUrl} target="_blank">
													{fontInUse.client}
												</a>
											) : (
												<span>{fontInUse.client}</span>
											)}
										</p>
										<p>
											<label>Related fonts</label>
											{fontInUse.fontUsed.map(fontUsed =>
												this.renderFont(fontUsed),
											)}
										</p>
										<p>
											<label>Designer</label>
											{isUrl.test(fontInUse.designerUrl) ? (
												<a href={fontInUse.designerUrl} target="_blank">
													{fontInUse.designer}
												</a>
											) : (
												<span>{fontInUse.designer}</span>
											)}
										</p>
										<p className="library-fontinuse-button">
											<Link to={`/library/fontinuse/${fontInUse.id}/edit`}>
												Edit
											</Link>
										</p>
									</div>
								</div>
							))}
					</div>
				</div>
				<LibrarySidebarRight>
					<Link className="sidebar-action" to="/library/fontinuse/create">
						Add fontsinuse
					</Link>
				</LibrarySidebarRight>
			</div>
		);
	}
}