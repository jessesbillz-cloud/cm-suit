// CLAUDE.md rule 10: no components defined inside components.
function isComponentName(name) {
  return typeof name === 'string' && /^[A-Z]/.test(name);
}
function returnsJsx(fn) {
  const body = fn.body;
  if (!body) return false;
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') return true;
  if (body.type !== 'BlockStatement') return false;
  return body.body.some(
    (s) => s.type === 'ReturnStatement' && s.argument && (s.argument.type === 'JSXElement' || s.argument.type === 'JSXFragment'),
  );
}
export const noNestedComponents = {
  meta: {
    type: 'problem',
    docs: { description: 'Do not define a React component inside another component' },
    messages: { nested: 'Component "{{name}}" is defined inside another function. Move it to module scope.' },
    schema: [],
  },
  create(context) {
    const stack = [];
    function enter(node) {
      let name = null;
      if (node.id) name = node.id.name;
      else if (node.parent && node.parent.type === 'VariableDeclarator' && node.parent.id.type === 'Identifier') name = node.parent.id.name;
      const isComponent = isComponentName(name) && returnsJsx(node);
      if (isComponent && stack.some((s) => s.isComponent)) {
        context.report({ node, messageId: 'nested', data: { name } });
      }
      stack.push({ isComponent });
    }
    function exit() {
      stack.pop();
    }
    return {
      FunctionDeclaration: enter,
      'FunctionDeclaration:exit': exit,
      FunctionExpression: enter,
      'FunctionExpression:exit': exit,
      ArrowFunctionExpression: enter,
      'ArrowFunctionExpression:exit': exit,
    };
  },
};
