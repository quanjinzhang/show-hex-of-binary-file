// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import HexStrProvider from './HexStrProvider';

const docList: Map<string, [vscode.TextDocument, number, number, boolean]> = new Map<string, [vscode.TextDocument, number, number, boolean]>();
let hexStrProvider = new HexStrProvider();
let hexStrReadonly: boolean = true;

function getReadonlyCfg() {
	let cfgReadonly = vscode.workspace.getConfiguration().get<string>("show-hex-of-binary-file.readOnly");
	if (typeof(cfgReadonly) === 'boolean') {
		hexStrReadonly = cfgReadonly;
	}
	return hexStrReadonly;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "show-hex-of-binary-file" is now active!');

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
		vscode.commands.registerCommand('extension.showBinHexStr', showBinHex)
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
			let doc = docInfo[0];
			if (doc.isClosed) {
				closedDocs.push(key);
			} else {
				let mtimeMs = docInfo[1];
				let size = docInfo[2];
				let filePath = key.substring(1);
				let newStat:fs.Stats = fs.statSync(filePath);
				if (mtimeMs !== fs.statSync(filePath).mtimeMs || size !== newStat.size) {
					console.log(`refresh the hex string of file: ${key} ${fs.statSync(filePath).mtimeMs} ${fs.statSync(filePath).size}`);
					if (typeof(docInfo[3]) === 'boolean' && docInfo[3]) {
						await showHexStrPreview(filePath, doc);
					} else {
						await showHexStrFromBinFile(filePath, true);
					}
				}
			}
		});
		doing = false;
	}, interval);
}

async function inputToShowHex() {
	const filePath = await vscode.window.showInputBox({
		placeHolder: 'Please input absolute path of the binary file to preview.',
	});
	if (filePath && filePath !== '') {
		if (fs.existsSync(filePath)) {
			let uri = vscode.Uri.file(filePath);
			try {
				let doc = await vscode.workspace.openTextDocument(uri);
				vscode.window.showInformationMessage(`'${filePath}' isn't a binary file. It's a text file!`);
			} catch (e) {
				// a binary file
				if (e.toString().includes('File seems to be binary')) {
					if (getReadonlyCfg()) {
						showHexStrPreview(filePath);
					} else {
						showHexStrFromBinFile(filePath);
					}
				} else {
					throw e;
				}
			}
		} else {
			vscode.window.showInformationMessage(`Please input a valid absolute path of a binary file to preview!\n'${filePath}' isn't valid!`);
		}
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
	let previewTitle: string = HexStrProvider.scheme + ':' + filePath;
	let uri: vscode.Uri = vscode.Uri.parse(previewTitle, false);
	if (openedDoc) {
		let stat:fs.Stats = fs.statSync(abspath);
		docList.set('0'+abspath, [openedDoc, stat.mtimeMs, stat.size, true]);
		hexStrProvider.update(uri);
		return;
	}
	let opened = false;
	vscode.workspace.openTextDocument(uri).then(doc => {
		let stat:fs.Stats = fs.statSync(abspath);
		docList.set('0'+abspath, [doc, stat.mtimeMs, stat.size, true]);
		vscode.window.showTextDocument(doc, {preview: false}).then(editor => {
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
	let hexStr = getHexStrFromPath(filePath);
	let filename = path.basename(filePath);
	let previewTitle: string = 'untitled:' + filename;
	let uri: vscode.Uri = vscode.Uri.parse(previewTitle, false);
	let opened = false;
	vscode.workspace.openTextDocument(uri).then(doc => {
		let stat:fs.Stats = fs.statSync(abspath);
		docList.set('1'+abspath, [doc, stat.mtimeMs, stat.size, false]);
		vscode.window.showTextDocument(doc).then(textEditor => {
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
