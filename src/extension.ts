// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import HexStrProvider from './HexStrProvider';

const docList: Map<string, [vscode.TextDocument, number, number, boolean, vscode.TextEditor]> = new Map<string, [vscode.TextDocument, number, number, boolean, vscode.TextEditor]>();
let hexStrProvider: HexStrProvider;
let hexStrReadonly: boolean = true;
enum DocEditorState { Closed, UnChanged, Changed }
let log: vscode.OutputChannel;

function getReadonlyCfg() {
	let cfgReadonly = vscode.workspace.getConfiguration().get<boolean>("show-hex-of-binary-file.readOnly");
	if (typeof(cfgReadonly) === 'boolean') {
		hexStrReadonly = cfgReadonly;
	}
	return hexStrReadonly;
}

/**
 * add menu event handler
 * @param uri the menu related doc uri
 * @param event the menu event
 */
function menuFunc(uri: vscode.Uri, event: vscode.Event<any>) {
	if (uri && uri.fsPath && fs.existsSync(uri.fsPath)) {
		if (getReadonlyCfg()) {
			showHexStrPreview(uri.fsPath);
		} else {
			showHexStrFromBinFile(uri.fsPath);
		}
	}
}

function hasChanged(key: string, docInfo: [vscode.TextDocument, number, number, boolean, vscode.TextEditor], isTimer?: boolean): DocEditorState {
	if (!key || !docInfo || !docInfo[0] || !isTimer) {
		if (key) {
			docList.delete(key);
		}
		return DocEditorState.Closed;
	}
	let doc = docInfo[0];
	// log.appendLine(`${key.substring(1)} ${docInfo[0].isClosed}`);
	if (doc.isClosed) {
		docList.delete(key);
		return DocEditorState.Closed;
	}
	let mtimeMs = docInfo[1];
	let size = docInfo[2];
	let filePath = key.substring(1);
	let newStat:fs.Stats = fs.statSync(filePath);
	if (mtimeMs !== fs.statSync(filePath).mtimeMs || size !== newStat.size) {
		return DocEditorState.Changed;
	}
	return DocEditorState.UnChanged;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	log = vscode.window.createOutputChannel("HexDumStr");
	hexStrProvider = new HexStrProvider(log);
	log.appendLine('Congratulations, your extension "show-hex-of-binary-file" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json

	let pickType = vscode.workspace.getConfiguration().get<string>("show-hex-of-binary-file.pickType");
	getReadonlyCfg();
	pickType = pickType ? pickType : "select";
	let showBinHex;
	if (pickType === 'input') {
		showBinHex = inputToShowHex;
	} else {
		showBinHex = selectToShowHex;
	}
	let disposables: vscode.Disposable[] = [
		vscode.workspace.registerTextDocumentContentProvider(HexStrProvider.scheme, hexStrProvider),
		vscode.commands.registerCommand('extension.showBinHexStr', showBinHex),
		vscode.commands.registerCommand('editor.title.showBinHexStr', menuFunc),
		vscode.commands.registerCommand('editor.context.showBinHexStr', menuFunc),
		vscode.commands.registerCommand('editor.title.context.showBinHexStr', menuFunc),
	];

	context.subscriptions.push(...disposables);

	let doing = false;
	let closedDocs: string[] = [];
	let interval = vscode.workspace.getConfiguration().get<number>("show-hex-of-binary-file.checkInterval");
	if (interval) {
		interval = interval < 500 ? 500: interval;
	} else {
		interval = 3000;
	}
	setInterval(function(){
		if (doing) {
			return;
		}
		if (closedDocs.length > 0) {
			for (let i=0; i<closedDocs.length; i++) {
				docList.delete(closedDocs[i]);
			}
			closedDocs = [];
		}
		doing = true;
		docList.forEach(async (docInfo, key) => {
			// check each opened binary file every 1 second, and reload them if the source changed
			let stat = hasChanged(key, docInfo, true);
			if (stat === DocEditorState.Changed) {
				let filePath = key.substring(1);
				log.appendLine(`refresh the hex string of file: ${key} ${fs.statSync(filePath).mtimeMs} ${fs.statSync(filePath).size}`);
				if (typeof(docInfo[3]) === 'boolean' && docInfo[3]) {
					await showHexStrPreview(filePath, docInfo[0]);
				} else {
					await showHexStrFromBinFile(filePath, true);
				}
			} else if (stat === DocEditorState.Closed) {
				closedDocs.push(key);
			}
		});
		doing = false;
	}, interval);
}

/**
 * show input box to input the absolute path of the binary file.
 */
async function inputToShowHex() {
	const filePath = await vscode.window.showInputBox({
		placeHolder: 'Please input absolute path of the binary file to preview.',
	});
	if (filePath) {
		showHexStrFromBinFile(filePath);
	}
}
/**
 * open file dialog to select binary file
 */
async function selectToShowHex() {
	const options: vscode.OpenDialogOptions = {
		canSelectMany: true,
		openLabel: 'Open',
		canSelectFiles: true,
		canSelectFolders: false
   	};
   	vscode.window.showOpenDialog(options).then(async fileUris => {
	   	if (fileUris && fileUris[0]) {
			for (let i=0; i<fileUris.length; i++) {
				if (getReadonlyCfg()) {
					await showHexStrPreview(fileUris[i].fsPath);
				} else {
					await showHexStrFromBinFile(fileUris[i].fsPath);
				}
			}
	   	}
   	});
}
/**
 * show readonly preview editor for the binary file
 * @param filePath the absolute path of the binary file
 * @param alreadyOpen the already opened flag of the binary file
 */
async function showHexStrPreview(filePath: string, openedDoc?: vscode.TextDocument): Promise<void> {
	if (!filePath || filePath.trim() === '' || !fs.existsSync(filePath)) {
		return;
	}
	let abspath = path.normalize(filePath);
	let key = '0' + abspath;
	if (!openedDoc) {
		// get the opened doc info list to check whether it has already been opended
		if (docList.has(key)) {
			let docInfo = docList.get(key);
			if (docInfo && docInfo[0]) {
				if (docInfo[0].isClosed) {
					docList.delete(key);
				} else {
					let stat = hasChanged(key, docInfo);
					if (stat === DocEditorState.Changed) {
						openedDoc = docInfo[0];
					} else if (stat === DocEditorState.UnChanged) {
						// log.appendLine(`The content hasn't been modified! "${abspath}"`);
						return;
					}
				}
			}
		}
	}
	let previewTitle: string = HexStrProvider.scheme + ':' + filePath.replace(/\\/g, '/');
	let uri: vscode.Uri = vscode.Uri.parse(previewTitle, false);
	if (openedDoc) {
		let stat:fs.Stats = fs.statSync(abspath);
		let docInfo = docList.get(key);
		if (docInfo) {
			docList.set(key, [openedDoc, stat.mtimeMs, stat.size, true, docInfo[4]]);
		}
		hexStrProvider.update(uri);
		return;
	}
	let opened = false;
	vscode.workspace.openTextDocument(uri).then(doc => {
		let stat:fs.Stats = fs.statSync(abspath);
		vscode.window.showTextDocument(doc, {preview: false}).then(editor => {
			docList.set(key, [doc, stat.mtimeMs, stat.size, true, editor]);
			opened = true;
		});
	}, reason => {
		vscode.window.showInformationMessage(reason.toString());
	});
	while (!opened) {
		// wait the file open
		await new Promise(done => setTimeout(done, 30));
	}
}

/**
 * get the hex string of the binary file
 * @param filePath the file path of the binary file
 */
function getHexStrFromPath(filePath: string): string {
	const baseNum = 16;
	let data = fs.readFileSync(filePath);
	let hexStr = '';
	for (let i=0; i<data.length;) {
		if (i%baseNum === 0) {
			hexStr += i.toString(baseNum).padStart(8, '0') + ': ';
		}
		hexStr += data[i].toString(baseNum).padStart(2, '0');
		let j = 1;
		for (;j<baseNum; j++) {
			if ((i+j) >= data.length) {
				break;
			}
			hexStr += ' ' + (data[i+j]).toString(baseNum).padStart(2, '0');
		}
		hexStr += '\n';
		i += baseNum;
	}
	return hexStr;
}

/**
 * show hex string from the binary file
 * @param filePath the file path of the binary file
 * @returns void
 */
async function showHexStrFromBinFile(filePath: string, alreadyOpen?: boolean): Promise<void> {
	if (!filePath || filePath.trim() === '' || !fs.existsSync(filePath)) {
		return;
	}
	let abspath = path.normalize(filePath);
	let key = '1' + abspath;
	if (!alreadyOpen) {
		// get the opened doc info list to check whether it has already been opended
		if (docList.has(key)) {
			let docInfo = docList.get(key);
			if (docInfo && docInfo[0]) {
				if (docInfo[0].isClosed) {
					docList.delete(key);
				} else {
					let stat = hasChanged(key, docInfo);
					if (stat === DocEditorState.Changed) {
						alreadyOpen = true;
					} else if (stat === DocEditorState.UnChanged) {
						// log.appendLine(`The content hasn't been modified! "${abspath}"`);
						return;
					}
				}
			}
		}
	}
	let hexStr = getHexStrFromPath(filePath);
	let filename = path.basename(filePath);
	let previewTitle: string = 'untitled:' + filename;
	let uri: vscode.Uri = vscode.Uri.parse(previewTitle, false);
	let opened = false;
	vscode.workspace.openTextDocument(uri).then(doc => {
		let stat:fs.Stats = fs.statSync(abspath);
		vscode.window.showTextDocument(doc).then(textEditor => {
			docList.set(key, [doc, stat.mtimeMs, stat.size, false, textEditor]);
			textEditor.edit(editBuilder =>{
				if (alreadyOpen) {
					let range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(doc.lineCount, 57));
					editBuilder.replace(range, hexStr);
				} else {
					editBuilder.insert(new vscode.Position(0, 0), hexStr);
				}
				// flag that the file has been opened
				opened = true;
			});
		});
	}, reason => {
		vscode.window.showInformationMessage(reason.toString());
	});
	while (!opened) {
		// wait the file open
		await new Promise(done => setTimeout(done, 30));
	}
}

// this method is called when your extension is deactivated
export function deactivate() {}
