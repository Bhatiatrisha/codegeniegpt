const vscode = require('vscode');
const { OpenAI } = require('openai');

let openai;

// This method is called when your extension is activated
function activate(context) {
	console.log('codegenieGPT extension is now active!');

	context.subscriptions.push(
		vscode.commands.registerCommand('codegeniegpt.configureLLM', configureLLM),
		vscode.commands.registerCommand('codegeniegpt.getCodeSuggestions', getCodeSuggestions)
	);
}

// Function to configure the LLM provider and API key
async function configureLLM() {
	const provider = await vscode.window.showInputBox({ prompt: 'Enter LLM provider (e.g., OpenAI)' });
	const apiKey = await vscode.window.showInputBox({ prompt: 'Enter your API key', password: true });

	if (provider && apiKey) {
		await vscode.workspace.getConfiguration().update('codegeniegpt.llmProvider', provider, vscode.ConfigurationTarget.Global);
		await vscode.workspace.getConfiguration().update('codegeniegpt.apiKey', apiKey, vscode.ConfigurationTarget.Global);
		vscode.window.showInformationMessage('LLM configured successfully!');

		openai = new OpenAI({ apiKey });
	}
}

// Function to get code suggestions from OpenAI
async function getCodeSuggestions() {
	const provider = vscode.workspace.getConfiguration().get('codegeniegpt.llmProvider');
	const apiKey = vscode.workspace.getConfiguration().get('codegeniegpt.apiKey');

	if (!provider || !apiKey || provider !== 'OpenAI') {
		vscode.window.showWarningMessage('Please configure the LLM provider and API key first.');
		return;
	}

	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showWarningMessage('No active editor found.');
		return;
	}

	const code = editor.document.getText();
	const suggestions = await fetchCodeSuggestions(code);

	if (suggestions) {
		// Open a new WebView to display suggestions
		showSuggestionsPanel(suggestions);
	} else {
		vscode.window.showErrorMessage('Failed to get code suggestions.');
	}
}

// Function to fetch code suggestions from OpenAI
async function fetchCodeSuggestions(code) {
	try {
		const response = await openai.chat.completions.create({
			model: 'gpt-3.5-turbo',
			messages: [
				{ role: 'user', content: `Provide code suggestions for the following code:\n${code}` }
			]
		});
		return response.choices[0].message.content;
	} catch (error) {
		console.error('Error fetching code suggestions:', error.response ? error.response.data : error.message);
		return null;
	}
}

// Function to show suggestions in a WebView
function showSuggestionsPanel(suggestions) {
	const panel = vscode.window.createWebviewPanel(
		'codeSuggestions', // Identifies the type of the webview
		'Code Suggestions', // Title of the panel
		vscode.ViewColumn.Beside, // Show the panel beside the active editor
		{
			enableScripts: true // Allow JavaScript in the webview
		}
	);

	// HTML content for the webview
	panel.webview.html = getWebviewContent(suggestions);
}

// Function to get HTML content for the webview
function getWebviewContent(suggestions) {
	return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Code Suggestions</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                pre { background: #f5f5f5; padding: 10px; border-radius: 5px; overflow: auto; color: black;}
                button { margin-top: 10px; }
            </style>
        </head>
        <body>
            <h2>Code Suggestions</h2>
            <pre>${suggestions}</pre>
            <button id="copyButton">Copy Code</button>
            <button id="insertButton">Insert Code</button>

            <script>
                const vscode = acquireVsCodeApi();

                document.getElementById('copyButton').addEventListener('click', () => {
                    const code = document.querySelector('pre').innerText;
                    navigator.clipboard.writeText(code).then(() => {
                        alert('Code copied to clipboard!');
                    });
                });

                document.getElementById('insertButton').addEventListener('click', () => {
                    const code = document.querySelector('pre').innerText;
                    vscode.postMessage({ command: 'insertCode', code: code });
                });
            </script>
        </body>
        </html>
    `;
}

// Listen for messages from the webview
vscode.workspace.onDidChangeTextDocument(event => {
	if (event.document.languageId === 'javascript' || event.document.languageId === 'typescript') {
		// Handle the insertion of code from the webview
		event.getWebviewPanel('codeSuggestions').webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'insertCode':
						const editor = vscode.window.activeTextEditor;
						if (editor) {
							const position = editor.selection.active;
							editor.edit(editBuilder => {
								editBuilder.insert(position, `\n${message.code}\n`);
							});
						}
						return;
				}
			},
			undefined,
			context.subscriptions
		);
	}
});

// This method is called when your extension is deactivated
function deactivate() { }

module.exports = {
	activate,
	deactivate
};
