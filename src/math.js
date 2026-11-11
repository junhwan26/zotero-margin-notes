(function (root) {
  'use strict';

  const MATHML = 'http://www.w3.org/1998/Math/MathML';
  const MAX_SOURCE = 2000;
  // Presentation attributes KaTeX emits. Links, scripts, and event handlers
  // are not MathML presentation attributes and are therefore never copied.
  const ATTRIBUTES = new Set(['accent', 'accentunder', 'columnalign', 'columnlines', 'columnspacing',
    'depth', 'display', 'displaystyle', 'encoding', 'fence', 'form', 'height', 'largeop', 'linethickness',
    'lspace', 'mathvariant', 'maxsize', 'minsize', 'movablelimits', 'notation', 'rowalign', 'rowlines',
    'rowspacing', 'rspace', 'scriptlevel', 'separator', 'stretchy', 'symmetric', 'voffset', 'width']);

  function copy(doc, source) {
    const target = doc.createElementNS(MATHML, source.localName);
    for (const attribute of source.attributes) {
      if (ATTRIBUTES.has(attribute.name)) target.setAttribute(attribute.name, attribute.value);
    }
    for (const child of source.childNodes) {
      if (child.nodeType === 3) target.appendChild(doc.createTextNode(child.nodeValue));
      // The <annotation> child repeats the TeX source; the comment already stores it.
      else if (child.nodeType === 1 && child.namespaceURI === MATHML && child.localName !== 'annotation') target.appendChild(copy(doc, child));
    }
    return target;
  }

  function markup(source, display) {
    const katex = root.MarginNotesVendor?.katex;
    if (!katex || typeof source !== 'string' || !source.trim() || source.length > MAX_SOURCE) return null;
    try {
      return katex.renderToString(source, { output: 'mathml', displayMode: !!display,
        throwOnError: true, trust: false, strict: 'ignore', maxExpand: 200, maxSize: 20 });
    } catch (_) {
      // An unfinished or unsupported formula stays visible as its source text.
      return null;
    }
  }

  // KaTeX only produces a string. Parse it in an inert document and rebuild the
  // MathML with DOM calls, so nothing from a comment enters the reader as HTML.
  function render(doc, source, display) {
    const html = markup(source, display);
    if (!html) return null;
    const parsed = new doc.defaultView.DOMParser().parseFromString(html, 'text/html');
    const math = parsed.querySelector('math');
    if (!math || math.namespaceURI !== MATHML) return null;
    const node = copy(doc, math);
    node.setAttribute('class', display ? 'mn-math mn-math-display' : 'mn-math');
    return node;
  }

  root.MarginNotesMath = { render, markup, available: () => !!root.MarginNotesVendor?.katex };
})(this);
