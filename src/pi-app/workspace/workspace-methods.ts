import { workspaceBootstrapMethods } from "./workspace-bootstrap-methods";
import { workspaceFolderMethods } from "./workspace-folder-methods";
import { workspaceRenderMethods } from "./workspace-render-methods";

export const workspaceMethods = {
  ...workspaceBootstrapMethods,
  ...workspaceRenderMethods,
  ...workspaceFolderMethods,
};
