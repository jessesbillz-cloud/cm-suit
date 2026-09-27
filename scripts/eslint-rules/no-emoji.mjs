// SPEC §7.1: no emojis anywhere in the UI.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;
export const noEmoji = {
  meta: {
    type: 'problem',
    docs: { description: 'No emojis in source' },
    messages: { emoji: 'No emojis. Use a Lucide icon only where it carries meaning.' },
    schema: [],
  },
  create(context) {
    function check(node, text) {
      if (EMOJI_RE.test(text)) context.report({ node, messageId: 'emoji' });
    }
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};
