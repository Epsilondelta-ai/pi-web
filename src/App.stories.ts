import App from "./App.astro";
import { PI_DATA } from "../.storybook/pi-fixtures";

const meta = {
  title: "Pi Web/App",
  component: App,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    initialRoute: "workspace",
    initialSession: "active",
    treeOpen: false,
    sidebarCollapsed: false,
    showCompaction: false,
    showDisconnect: false,
    scanlines: false,
    showUpdateRelease: false,
    showUpdateTip: false,
    workspaces: PI_DATA.WORKSPACES,
    fileTree: PI_DATA.FILE_TREE,
    conversation: PI_DATA.CONVERSATION,
    slashCommands: PI_DATA.SLASH_COMMANDS,
  },
};

export default meta;

export const Workspace = {};

export const WorkspacePicker = {
  args: {
    initialRoute: "picker",
  },
};

export const EmptySession = {
  args: {
    initialSession: "empty",
  },
};

export const DisconnectedCompaction = {
  args: {
    showDisconnect: true,
    showCompaction: true,
    scanlines: true,
  },
};

export const SidebarCollapsed = {
  args: {
    sidebarCollapsed: true,
  },
};

export const WithFileTree = {
  args: {
    treeOpen: true,
  },
};

export const NewVersionReleased = {
  args: {
    showUpdateRelease: true,
  },
};
