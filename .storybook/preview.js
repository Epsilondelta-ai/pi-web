import "../src/design-system/colors_and_type.css";
import "../src/styles.css";
import "../src/extras.css";

const preview = {
  parameters: {
    layout: "fullscreen",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
