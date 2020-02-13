import * as vscode from "vscode";

export class AsyncAPIPreviewConfig {
  public static getCurrentConfig() {
    return new AsyncAPIPreviewConfig();
  }

  // preview config
  public readonly liveUpdate: boolean;
  public readonly singlePreview: boolean;
  public readonly automaticallyShowPreviewOfAsyncApiBeingEdited: boolean;

  private constructor() {
    const config = vscode.workspace.getConfiguration(
      "asyncapi-preview",
    );
    
    this.liveUpdate = config.get<boolean>("liveUpdate");
    this.singlePreview = config.get<boolean>("singlePreview");
    this.automaticallyShowPreviewOfAsyncApiBeingEdited = config.get<boolean>(
      "automaticallyShowPreviewOfAsyncApiBeingEdited",
    );
  }

  public isEqualTo(otherConfig: AsyncAPIPreviewConfig) {
    const json1 = JSON.stringify(this);
    const json2 = JSON.stringify(otherConfig);
    return json1 === json2;
  }

  [key: string]: any;
}
