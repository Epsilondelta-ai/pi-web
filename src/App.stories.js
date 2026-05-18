import App from "./App.astro";

const meta = {
  title: "Pi Web/App",
  component: App,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    initialRoute: "workspace",
    initialSession: "active",
    treeOpen: true,
    sidebarCollapsed: false,
    showCompaction: false,
    showDisconnect: false,
    scanlines: false,
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

export const NoFileTree = {
  args: {
    treeOpen: false,
  },
};
