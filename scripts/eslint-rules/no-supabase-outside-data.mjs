// CLAUDE.md rule 5: the app talks to Supabase only through src/data/.
const BANNED_IMPORTS = ['@supabase/supabase-js', 'tus-js-client'];
const URL_RE = /supabase\.(co|in)|\/functions\/v1\/|\/rest\/v1\/|\/storage\/v1\//;

export const noSupabaseOutsideData = {
  meta: {
    type: 'problem',
    docs: { description: 'Supabase clients, fetch and Supabase URLs are allowed only in src/data/' },
    messages: {
      banned: 'Supabase access lives only in src/data/. Import a query or mutation from there instead.',
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (BANNED_IMPORTS.includes(node.source.value)) context.report({ node, messageId: 'banned' });
      },
      Literal(node) {
        if (typeof node.value === 'string' && URL_RE.test(node.value)) context.report({ node, messageId: 'banned' });
      },
      TemplateElement(node) {
        if (URL_RE.test(node.value.raw)) context.report({ node, messageId: 'banned' });
      },
    };
  },
};
