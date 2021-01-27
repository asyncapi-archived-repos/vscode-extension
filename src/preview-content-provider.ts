import AsyncAPIGenerator from "@asyncapi/generator";
import { tmpdir } from "os";
import * as path from "path";
import * as vscode from "vscode";
import { Uri } from "vscode";
import { AsyncAPIPreviewConfig } from "./config";

export class AsyncAPIPreviewView {
  private waiting: boolean = false;

  /**
   * The key is AsyncAPI file fspath
   * value is Preview (vscode.Webview) object
   */
  private previewMaps: { [key: string]: vscode.WebviewPanel } = {};

  private preview2EditorMap: Map<
    vscode.WebviewPanel,
    vscode.TextEditor
  > = new Map();

  private singlePreviewPanel: vscode.WebviewPanel;
  private singlePreviewPanelSourceUriTarget: Uri;

  private config: AsyncAPIPreviewConfig;

  public constructor(private context: vscode.ExtensionContext) {
    this.config = AsyncAPIPreviewConfig.getCurrentConfig();
  }

  private refreshAllPreviews() {
    // refresh iframes
    if (useSinglePreview()) {
      this.refreshPreviewPanel(this.singlePreviewPanelSourceUriTarget);
    } else {
      for (const key in this.previewMaps) {
        if (this.previewMaps.hasOwnProperty(key)) {
          this.refreshPreviewPanel(vscode.Uri.file(key));
        }
      }
    }
  }

  /**
   * return AsyncAPI preview of sourceUri
   * @param sourceUri
   */
  public getPreview(sourceUri: Uri): vscode.WebviewPanel {
    if (useSinglePreview()) {
      return this.singlePreviewPanel;
    } else {
      return this.previewMaps[sourceUri.fsPath];
    }
  }

  /**
   * check if the AsyncAPI preview is on for the textEditor
   * @param textEditor
   */
  public isPreviewOn(sourceUri: Uri) {
    if (useSinglePreview()) {
      return !!this.singlePreviewPanel;
    } else {
      return !!this.getPreview(sourceUri);
    }
  }

  public destroyPreview(sourceUri: Uri) {
    if (useSinglePreview()) {
      this.singlePreviewPanel = null;
      this.singlePreviewPanelSourceUriTarget = null;
      this.preview2EditorMap = new Map();
      this.previewMaps = {};
    } else {
      const previewPanel = this.getPreview(sourceUri);
      if (previewPanel) {
        this.preview2EditorMap.delete(previewPanel);
        delete this.previewMaps[sourceUri.fsPath];
      }
    }
  }

  /**
   * Format pathString if it is on Windows. Convert `c:\` like string to `C:\`
   * @param pathString
   */
  private formatPathIfNecessary(pathString: string) {
    if (process.platform === "win32") {
      pathString = pathString.replace(
        /^([a-zA-Z])\:\\/,
        (_, $1) => `${$1.toUpperCase()}:\\`,
      );
    }
    return pathString;
  }

  private getProjectDirectoryPath(
    sourceUri: Uri,
    workspaceFolders: vscode.WorkspaceFolder[] = [],
  ) {
    const possibleWorkspaceFolders = workspaceFolders.filter(
      (workspaceFolder) => {
        return (
          path
            .dirname(sourceUri.path.toUpperCase())
            .indexOf(workspaceFolder.uri.path.toUpperCase()) >= 0
        );
      },
    );

    let projectDirectoryPath;
    if (possibleWorkspaceFolders.length) {
      // We pick the workspaceUri that has the longest path
      const workspaceFolder = possibleWorkspaceFolders.sort(
        (x, y) => y.uri.fsPath.length - x.uri.fsPath.length,
      )[0];
      projectDirectoryPath = workspaceFolder.uri.fsPath;
    } else {
      projectDirectoryPath = "";
    }

    return this.formatPathIfNecessary(projectDirectoryPath);
  }

  public async initPreview(
    sourceUri: vscode.Uri,
    editor: vscode.TextEditor,
    viewOptions: { viewColumn: vscode.ViewColumn; preserveFocus?: boolean },
  ) {
    const isUsingSinglePreview = useSinglePreview();
    let previewPanel: vscode.WebviewPanel;
    if (isUsingSinglePreview && this.singlePreviewPanel) {
      const oldResourceRoot =
        this.getProjectDirectoryPath(
          this.singlePreviewPanelSourceUriTarget,
          vscode.workspace.workspaceFolders,
        ) || path.dirname(this.singlePreviewPanelSourceUriTarget.fsPath);
      const newResourceRoot =
        this.getProjectDirectoryPath(
          sourceUri,
          vscode.workspace.workspaceFolders,
        ) || path.dirname(sourceUri.fsPath);
      if (oldResourceRoot !== newResourceRoot) {
        this.singlePreviewPanel.dispose();
        return this.initPreview(sourceUri, editor, viewOptions);
      } else {
        previewPanel = this.singlePreviewPanel;
        this.singlePreviewPanelSourceUriTarget = sourceUri;
      }
    } else if (this.previewMaps[sourceUri.fsPath]) {
      previewPanel = this.previewMaps[sourceUri.fsPath];
    } else {
      const localResourceRoots = [
        vscode.Uri.file(this.context.extensionPath),
        vscode.Uri.file(tmpdir()),
        vscode.Uri.file(
          this.getProjectDirectoryPath(
            sourceUri,
            vscode.workspace.workspaceFolders,
          ) || path.dirname(sourceUri.fsPath),
        ),
      ];

      previewPanel = vscode.window.createWebviewPanel(
        "asyncapi-preview",
        `Preview ${path.basename(sourceUri.fsPath)}`,
        viewOptions,
        {
          enableFindWidget: true,
          localResourceRoots,
          enableScripts: true, // TODO: This might be set by enableScriptExecution config. But for now we just enable it.
        },
      );

      // register previewPanel message events
      previewPanel.webview.onDidReceiveMessage(
        (message) => {
          vscode.commands.executeCommand(
            `asyncapi.${message.command}`,
            ...message.args,
          );
        },
        null,
        this.context.subscriptions,
      );

      // unregister previewPanel
      previewPanel.onDidDispose(
        () => {
          this.destroyPreview(sourceUri);
        },
        null,
        this.context.subscriptions,
      );

      if (isUsingSinglePreview) {
        this.singlePreviewPanel = previewPanel;
        this.singlePreviewPanelSourceUriTarget = sourceUri;
      }
    }

    // register previewPanel
    this.previewMaps[sourceUri.fsPath] = previewPanel;
    this.preview2EditorMap.set(previewPanel, editor);

    // set title
    previewPanel.title = `Preview ${path.basename(sourceUri.fsPath)}`;

    const text = editor.document.getText();

    const generator = new AsyncAPIGenerator("html", tmpdir(), {
      entrypoint: "index.html",
      output: "string",
      templateParams: {
        baseHref: "https://playground.asyncapi.io/html/template/",
      },
    });
    const html = await generator.generateFromString(text);
    previewPanel.webview.html = `<style>html, body { background-color: white; color: black; }\na:hover { color: black; }</style>\n${html}`;
  }

  /**
   * Close all previews
   */
  public closeAllPreviews(singlePreview: boolean) {
    if (singlePreview) {
      if (this.singlePreviewPanel) {
        this.singlePreviewPanel.dispose();
      }
    } else {
      const previewPanels = [];
      for (const key in this.previewMaps) {
        if (this.previewMaps.hasOwnProperty(key)) {
          const previewPanel = this.previewMaps[key];
          if (previewPanel) {
            previewPanels.push(previewPanel);
          }
        }
      }

      previewPanels.forEach((previewPanel) => previewPanel.dispose());
    }

    this.previewMaps = {};
    this.preview2EditorMap = new Map();
    this.singlePreviewPanel = null;
    this.singlePreviewPanelSourceUriTarget = null;
  }

  public previewPostMessage(sourceUri: Uri, message: any) {
    const preview = this.getPreview(sourceUri);
    if (preview) {
      preview.webview.postMessage(message);
    }
  }

  public previewHasTheSameSingleSourceUri(sourceUri: Uri) {
    if (!this.singlePreviewPanelSourceUriTarget) {
      return false;
    } else {
      return this.singlePreviewPanelSourceUriTarget.fsPath === sourceUri.fsPath;
    }
  }

  public refreshPreviewPanel(sourceUri: Uri) {
    this.preview2EditorMap.forEach((editor, previewPanel) => {
      if (
        previewPanel &&
        editor &&
        editor.document &&
        editor.document.uri &&
        editor.document.uri.fsPath === sourceUri.fsPath
      ) {
        this.initPreview(sourceUri, editor, {
          viewColumn: previewPanel.viewColumn,
          preserveFocus: true,
        });
      }
    });
  }

  public update(sourceUri: Uri) {
    if (!this.config.liveUpdate || !this.getPreview(sourceUri)) {
      return;
    }

    if (!this.waiting) {
      this.waiting = true;
      setTimeout(() => {
        this.waiting = false;
        // this._onDidChange.fire(uri);
        this.refreshPreviewPanel(sourceUri);
      }, 300);
    }
  }

  public updateConfiguration() {
    const newConfig = AsyncAPIPreviewConfig.getCurrentConfig();
    if (!this.config.isEqualTo(newConfig)) {
      // if `singlePreview` setting is changed, close all previews.
      if (this.config.singlePreview !== newConfig.singlePreview) {
        this.closeAllPreviews(this.config.singlePreview);
        this.config = newConfig;
      } else {
        this.config = newConfig;
        // update all generated AsyncAPI documents
        this.refreshAllPreviews();
      }
    }
  }
}

/**
 * check whehter to use only one preview or not
 */
export function useSinglePreview() {
  const config = vscode.workspace.getConfiguration("asyncapi-preview");
  return config.get<boolean>("singlePreview");
}

export function getPreviewUri(uri: vscode.Uri) {
  if (uri.scheme === "asyncapi-preview") {
    return uri;
  }

  let previewUri: Uri;
  if (useSinglePreview()) {
    previewUri = uri.with({
      scheme: "asyncapi-preview",
      path: "single-preview.rendered",
    });
  } else {
    previewUri = uri.with({
      scheme: "asyncapi-preview",
      path: uri.path + ".rendered",
      query: uri.toString(),
    });
  }
  return previewUri;
}
