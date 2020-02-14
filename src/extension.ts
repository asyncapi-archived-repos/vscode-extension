// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import {
  AsyncAPIPreviewView,
} from "./preview-content-provider";

// this method is called when your extension iopenTextDocuments activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // assume only one preview supported.
  const contentProvider = new AsyncAPIPreviewView(context);

  function openPreviewToTheSide(uri?: vscode.Uri) {
    let resource = uri;
    if (!(resource instanceof vscode.Uri)) {
      if (vscode.window.activeTextEditor) {
        // we are relaxed and don't check for AsyncAPI files
        resource = vscode.window.activeTextEditor.document.uri;
      }
    }
    contentProvider.initPreview(resource, vscode.window.activeTextEditor, {
      viewColumn: vscode.ViewColumn.Two,
      preserveFocus: true,
    });
  }

  function toggleLiveUpdate() {
    const config = vscode.workspace.getConfiguration(
      "asyncapi-preview",
    );
    const liveUpdate = !config.get<boolean>("liveUpdate");
    config.update("liveUpdate", liveUpdate, true).then(() => {
      contentProvider.updateConfiguration();
      if (liveUpdate) {
        vscode.window.showInformationMessage("Live Update is enabled");
      } else {
        vscode.window.showInformationMessage("Live Update is disabled");
      }
    });
  }

  function refreshPreview(uri) {
    const sourceUri = vscode.Uri.parse(uri);
    contentProvider.refreshPreviewPanel(sourceUri);
  }

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      contentProvider.update(document.uri);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      contentProvider.update(event.document.uri);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(() => {
      contentProvider.updateConfiguration();
    }),
  );

  /**
   * Open preview automatically if the `automaticallyShowPreviewOfAsyncApiBeingEdited` is on.
   * @param textEditor
   */
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((textEditor) => {
      if (textEditor && textEditor.document && textEditor.document.uri) {
        const sourceUri = textEditor.document.uri;
        const config = vscode.workspace.getConfiguration(
          "asyncapi-preview",
        );
        const automaticallyShowPreviewOfAsyncApiBeingEdited = config.get<
          boolean
        >("automaticallyShowPreviewOfAsyncApiBeingEdited");
        const isUsingSinglePreview = config.get<boolean>("singlePreview");
        /**
         * Is using single preview and the preview is on.
         * When we switched text ed()tor, update preview to that text editor.
         */

        if (contentProvider.isPreviewOn(sourceUri)) {
          if (
            isUsingSinglePreview &&
            !contentProvider.previewHasTheSameSingleSourceUri(sourceUri)
          ) {
            contentProvider.initPreview(sourceUri, textEditor, {
              viewColumn: contentProvider.getPreview(sourceUri).viewColumn,
              preserveFocus: true,
            });
          } else if (
            !isUsingSinglePreview &&
            automaticallyShowPreviewOfAsyncApiBeingEdited
          ) {
            const previewPanel = contentProvider.getPreview(sourceUri);
            if (previewPanel) {
              previewPanel.reveal(vscode.ViewColumn.Two, true);
            }
          }
        }
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "asyncapi-preview.openPreviewToTheSide",
      openPreviewToTheSide,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "asyncapi-preview.toggleLiveUpdate",
      toggleLiveUpdate,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("asyncapi.refreshPreview", refreshPreview),
  );
}

// this method is called when your extension is deactivated
export function deactivate() {
  //
}
