(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  // Zotero's loadSubScript target may differ from globalThis.
  if (root) root.MarginNotesMarkdown = api;
})(this, function () {
  "use strict";

  const MAX_DEPTH = 24;
  const MAX_FORMATTED_LENGTH = 200000;
  const punctuation = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
  const text = value => ({ type: "text", value });

  function safeURL(value) {
    if (typeof value !== "string" || !value || /[\s\u0000-\u001f\u007f-\u009f<>\\]/.test(value)) return null;
    if (/^https?:\/\/[^/?#]+(?:[/?#].*)?$/i.test(value) || /^mailto:[^?]+(?:\?.*)?$/i.test(value)) return value;
    return null;
  }

  function pushText(nodes, value) {
    if (!value) return;
    const previous = nodes[nodes.length - 1];
    if (previous && previous.type === "text") previous.value += value;
    else nodes.push(text(value));
  }

  function escaped(source, index) {
    let backslashes = 0;
    while (index > 0 && source[--index] === "\\") backslashes++;
    return backslashes % 2 === 1;
  }

  function closingDelimiter(source, delimiter, start, budget) {
    let position = start;
    while (budget.remaining > 0) {
      const begin = position;
      position = source.indexOf(delimiter, position);
      budget.remaining -= (position === -1 ? source.length : position) - begin + 1;
      if (position === -1 || budget.remaining < 0) return -1;
      let end = position + delimiter.length;
      while (source[end] === delimiter[0]) { end++; budget.remaining--; }
      const runLength = end - position;
      const before = source[position - 1] || "";
      const after = source[end] || "";
      // A single emphasis marker skips paired strong markers. At a combined
      // closing run, consume its outer markers last so nested emphasis survives.
      const compatible = delimiter.length !== 1 || runLength % 2 === 1;
      if (compatible && !escaped(source, position) && before && !/\s/.test(before)
        && !(delimiter[0] === "_" && /[\p{L}\p{N}]/u.test(before) && /[\p{L}\p{N}]/u.test(after))) return end - delimiter.length;
      position = end;
    }
    return -1;
  }

  function linkAt(source, start, budget) {
    let depth = 0;
    let close = -1;
    for (let i = start + 1; i < source.length; i++) {
      if (--budget.remaining < 0) return null;
      if (source[i] === "\\") { i++; continue; }
      if (source[i] === "[") depth++;
      if (source[i] === "]") {
        if (!depth) { close = i; break; }
        depth--;
      }
    }
    if (close === -1 || source[close + 1] !== "(") return null;
    let i = close + 2;
    while (source[i] === " " || source[i] === "\t") i++;
    let destination = "";
    if (source[i] === "<") {
      const end = source.indexOf(">", i + 1);
      budget.remaining -= (end === -1 ? source.length : end) - i;
      if (budget.remaining < 0) return null;
      if (end === -1 || source.slice(i, end).includes("\n")) return null;
      destination = source.slice(i + 1, end);
      i = end + 1;
    } else {
      let nesting = 0;
      const begin = i;
      for (; i < source.length; i++) {
        if (--budget.remaining < 0) return null;
        if (source[i] === "\\") { i++; continue; }
        const character = source[i];
        if (/\s/.test(character)) break;
        if (character === "(") nesting++;
        if (character === ")") {
          if (!nesting) break;
          nesting--;
        }
        if (nesting > MAX_DEPTH) return null;
      }
      if (nesting) return null;
      destination = source.slice(begin, i);
    }
    while (source[i] === " " || source[i] === "\t") i++;
    let title;
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i++];
      const begin = i;
      while (i < source.length && (source[i] !== quote || escaped(source, i)) && source[i] !== "\n") i++;
      if (source[i] !== quote) return null;
      title = source.slice(begin, i++);
      while (source[i] === " " || source[i] === "\t") i++;
    }
    if (source[i] !== ")") return null;
    return { label: source.slice(start + 1, close), destination: destination.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1"), title, end: i + 1 };
  }

  function inline(source, depth = 0, allowLinks = true) {
    if (depth >= MAX_DEPTH || source.length > MAX_FORMATTED_LENGTH) return [text(source)];
    const nodes = [];
    let cursor = 0;
    const budget = { remaining: source.length * 8 };
    while (cursor < source.length) {
      // A malformed delimiter-heavy note must still finish promptly and retain text.
      if (--budget.remaining < 0) { pushText(nodes, source.slice(cursor)); break; }
      const character = source[cursor];
      if (character === "\\" && (punctuation.test(source[cursor + 1] || "") || source[cursor + 1] === "\n")) {
        if (source[cursor + 1] === "\n") nodes.push({ type: "break" });
        else pushText(nodes, source[cursor + 1]);
        cursor += 2;
        continue;
      }
      if (character === "\n") { nodes.push({ type: "break" }); cursor++; continue; }
      if (character === "`") {
        const marker = /^`+/.exec(source.slice(cursor))[0];
        let close = cursor + marker.length;
        while (budget.remaining > 0) {
          const begin = close;
          close = source.indexOf(marker, close);
          budget.remaining -= (close === -1 ? source.length : close) - begin + 1;
          if (close === -1 || budget.remaining < 0) { close = -1; break; }
          if (source[close - 1] !== "`" && source[close + marker.length] !== "`") break;
          close += marker.length;
        }
        if (close !== -1) {
          let value = source.slice(cursor + marker.length, close).replace(/\n/g, " ");
          if (value.startsWith(" ") && value.endsWith(" ") && /[^ ]/.test(value)) value = value.slice(1, -1);
          nodes.push({ type: "code", value });
          cursor = close + marker.length;
          continue;
        }
        pushText(nodes, marker); cursor += marker.length; continue;
      }
      if (allowLinks && (character === "[" || (character === "!" && source[cursor + 1] === "["))) {
        const image = character === "!";
        const match = linkAt(source, cursor + (image ? 1 : 0), budget);
        if (match) {
          const href = safeURL(match.destination);
          if (image || !href) pushText(nodes, source.slice(cursor, match.end));
          else nodes.push({ type: "link", href, title: match.title, children: inline(match.label, depth + 1, false) });
          cursor = match.end;
          continue;
        }
      }
      if (character === "<") {
        const end = source.indexOf(">", cursor + 1);
        budget.remaining -= (end === -1 ? source.length : end) - cursor;
        if (end !== -1 && !source.slice(cursor, end).includes("\n")) {
          const value = source.slice(cursor, end + 1);
          const href = allowLinks && safeURL(value.slice(1, -1));
          if (href) nodes.push({ type: "link", href, children: [text(value.slice(1, -1))] });
          else if (/^<\/?[A-Za-z][^>]*>$/.test(value)) nodes.push({ type: "html", value });
          else pushText(nodes, value);
          cursor = end + 1;
          continue;
        }
      }
      if (character === "*" || character === "_" || character === "~") {
        const match = /^(\*{1,3}|_{1,3}|~~)/.exec(source.slice(cursor));
        if (match) {
          const delimiter = match[0];
          const after = source[cursor + delimiter.length] || "";
          const before = source[cursor - 1] || "";
          const canOpen = after && !/\s/.test(after)
            && !(character === "_" && /[\p{L}\p{N}]/u.test(before) && /[\p{L}\p{N}]/u.test(after));
          const close = canOpen ? closingDelimiter(source, delimiter, cursor + delimiter.length, budget) : -1;
          if (close !== -1) {
            const children = inline(source.slice(cursor + delimiter.length, close), depth + 1, allowLinks);
            if (delimiter.length === 3) nodes.push({ type: "strong", children: [{ type: "emphasis", children }] });
            else nodes.push({ type: character === "~" ? "delete" : delimiter.length === 2 ? "strong" : "emphasis", children });
            cursor = close + delimiter.length;
            continue;
          }
          pushText(nodes, delimiter); cursor += delimiter.length; continue;
        }
      }
      // Consume ordinary text in one chunk, avoiding per-character concatenation.
      const begin = cursor++;
      while (cursor < source.length && !/[\\\n`[!<*_~]/.test(source[cursor])) cursor++;
      pushText(nodes, source.slice(begin, cursor));
    }
    return nodes;
  }

  const fence = line => /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(line);
  const listMarker = line => /^( {0,3})([*+-]|\d{1,9}[.)])([ \t]+)(.*)$/.exec(line);
  const horizontalRule = line => /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
  const blockStart = line => fence(line) || /^ {0,3}(?:#{1,6}(?:\s|$)|>)/.test(line) || listMarker(line) || horizontalRule(line);

  function cells(line) {
    const result = [];
    let value = "";
    let codeMarker = "";
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "\\" && line[i + 1] === "|") { value += "|"; i++; continue; }
      if (line[i] === "`") {
        const marker = /^`+/.exec(line.slice(i))[0];
        if (!codeMarker) codeMarker = marker;
        else if (codeMarker === marker) codeMarker = "";
        value += marker;
        i += marker.length - 1;
      } else if (line[i] === "|" && !codeMarker) { result.push(value.trim()); value = ""; }
      else value += line[i];
    }
    result.push(value.trim());
    if (!result[0] && line.trimStart().startsWith("|")) result.shift();
    if (!result[result.length - 1] && line.trimEnd().endsWith("|")) result.pop();
    return result;
  }

  function tableAlignment(header, delimiter) {
    if (!header.includes("|") || !delimiter) return null;
    const markers = cells(delimiter);
    if (!markers.length || !markers.every(value => /^:?-{3,}:?$/.test(value)) || markers.length !== cells(header).length) return null;
    return markers.map(value => value.startsWith(":") && value.endsWith(":") ? "center" : value.endsWith(":") ? "right" : "left");
  }

  function blocks(lines, depth = 0) {
    if (depth >= MAX_DEPTH) return [{ type: "paragraph", children: [text(lines.join("\n"))] }];
    const result = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const opening = fence(line);
      if (opening && !(opening[1][0] === "`" && opening[2].includes("`"))) {
        const marker = opening[1][0];
        const minimum = opening[1].length;
        const closing = new RegExp("^ {0,3}" + marker + "{" + minimum + ",}[ \\t]*$");
        const content = [];
        i++;
        while (i < lines.length) {
          if (closing.test(lines[i])) { i++; break; }
          content.push(lines[i++]);
        }
        const language = opening[2].trim().split(/\s/)[0];
        result.push({ type: "codeBlock", value: content.join("\n"), language: /^[\w+-]{1,40}$/.test(language) ? language : "" });
        continue;
      }
      const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|$)/.exec(line);
      if (heading) {
        result.push({ type: "heading", level: heading[1].length, children: inline((heading[2] || "").replace(/[ \t]+#+[ \t]*$/, "")) });
        i++;
        continue;
      }
      if (horizontalRule(line)) { result.push({ type: "rule" }); i++; continue; }
      if (/^ {0,3}>/.test(line)) {
        const quoted = [];
        while (i < lines.length && /^ {0,3}>/.test(lines[i])) quoted.push(lines[i++].replace(/^ {0,3}>[ \t]?/, ""));
        result.push({ type: "quote", children: blocks(quoted, depth + 1) });
        continue;
      }
      const first = listMarker(line);
      if (first) {
        const baseIndent = first[1].length;
        const ordered = /^\d/.test(first[2]);
        const items = [];
        while (i < lines.length) {
          const marker = listMarker(lines[i]);
          if (!marker || marker[1].length !== baseIndent || /^\d/.test(marker[2]) !== ordered) break;
          const contentIndent = marker[1].length + marker[2].length + marker[3].length;
          const itemLines = [marker[4]];
          let afterBlank = false;
          i++;
          while (i < lines.length) {
            const next = listMarker(lines[i]);
            if (next && next[1].length === baseIndent) break;
            if (!lines[i].trim()) { itemLines.push(""); afterBlank = true; i++; continue; }
            const indent = /^ */.exec(lines[i])[0].length;
            if (indent >= contentIndent) itemLines.push(lines[i++].slice(contentIndent));
            else if (!afterBlank && !blockStart(lines[i])) itemLines.push(lines[i++].slice(Math.min(indent, baseIndent)));
            else break;
          }
          let checked;
          const task = /^\[([ xX])\][ \t]+(.*)$/.exec(itemLines[0]);
          if (task) { checked = task[1] !== " "; itemLines[0] = task[2]; }
          items.push({ type: "listItem", checked, children: blocks(itemLines, depth + 1) });
        }
        result.push({ type: "list", ordered, start: ordered ? parseInt(first[2], 10) : undefined, children: items });
        continue;
      }
      if (/^(?: {4}|\t)/.test(line)) {
        const content = [];
        while (i < lines.length && (/^(?: {4}|\t)/.test(lines[i]) || !lines[i].trim())) content.push(lines[i++].replace(/^(?: {4}|\t)/, ""));
        while (content.length && !content[content.length - 1]) content.pop();
        result.push({ type: "codeBlock", value: content.join("\n"), language: "" });
        continue;
      }
      const alignment = tableAlignment(line, lines[i + 1]);
      if (alignment) {
        const headers = cells(line).map(value => inline(value));
        const rows = [];
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].includes("|") && !blockStart(lines[i])) {
          const row = cells(lines[i++]);
          rows.push(alignment.map((_, column) => inline(row[column] || "")));
        }
        result.push({ type: "table", headers, rows, alignment });
        continue;
      }
      if (lines[i + 1] && /^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[i + 1])) {
        result.push({ type: "heading", level: lines[i + 1].trim()[0] === "=" ? 1 : 2, children: inline(line.trim()) });
        i += 2;
        continue;
      }
      const paragraph = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !blockStart(lines[i]) && !/^ {4}|^\t/.test(lines[i]) && !tableAlignment(lines[i], lines[i + 1])) paragraph.push(lines[i++]);
      result.push({ type: "paragraph", children: inline(paragraph.join("\n")) });
    }
    return result;
  }

  function parse(source) {
    const value = String(source == null ? "" : source).replace(/\r\n?/g, "\n");
    if (!value) return [];
    if (value.length > MAX_FORMATTED_LENGTH) return [{ type: "paragraph", children: [text(value)] }];
    return blocks(value.split("\n"));
  }

  function hasRichText(source, inlineOnly = false) {
    const value = String(source == null ? "" : source);
    if (value.length > MAX_FORMATTED_LENGTH) {
      // Oversized comments deliberately skip parsing. Conservatively retain
      // native rich-text editing rather than accidentally flattening their HTML.
      return (inlineOnly ? /<\/?(?:i|b|sub|sup)\b/i : /<\/?(?:i|b|sub|sup|br|p|div|li)\b/i).test(value);
    }
    const expression = inlineOnly ? /^<\/?(?:i|b|sub|sup)\b/i : /^<\/?(?:i|b|sub|sup|br|p|div|li)\b/i;
    const visit = nodes => nodes.some(node => node.type === "html" && expression.test(node.value)
      || node.children && visit(node.children)
      || node.headers && node.headers.some(visit)
      || node.rows && node.rows.some(row => row.some(visit)));
    return visit(parse(source));
  }

  function append(doc, parent, nodes, options) {
    for (const node of nodes) {
      if (node.type === "html" && options.legacyHTML && /^<\/?(?:i|b|sub|sup|br|p|div|li)\b/i.test(node.value)) {
        if (/^<\/?br\b|^<\/(?:p|div|li)\b/i.test(node.value)) parent.appendChild(doc.createElement("br"));
        continue;
      }
      if (node.type === "text" || node.type === "html") {
        const value = node.type === "text" && typeof options.decodeText === "function" ? options.decodeText(node.value) : node.value;
        parent.appendChild(doc.createTextNode(value));
        continue;
      }
      if (node.type === "table") {
        const table = doc.createElement("table");
        const head = doc.createElement("thead");
        const header = doc.createElement("tr");
        node.headers.forEach((children, column) => {
          const cell = doc.createElement("th");
          cell.setAttribute("align", node.alignment[column]);
          append(doc, cell, children, options);
          header.appendChild(cell);
        });
        head.appendChild(header);
        table.appendChild(head);
        const body = doc.createElement("tbody");
        for (const row of node.rows) {
          const tr = doc.createElement("tr");
          row.forEach((children, column) => {
            const cell = doc.createElement("td");
            cell.setAttribute("align", node.alignment[column]);
            append(doc, cell, children, options);
            tr.appendChild(cell);
          });
          body.appendChild(tr);
        }
        table.appendChild(body);
        parent.appendChild(table);
        continue;
      }
      const tags = { paragraph: "p", heading: "h" + node.level, quote: "blockquote", list: node.ordered ? "ol" : "ul",
        listItem: "li", code: "code", codeBlock: "pre", strong: "strong", emphasis: "em", delete: "del", link: "a", break: "br", rule: "hr" };
      const tag = tags[node.type];
      if (!tag) continue;
      const element = doc.createElement(tag);
      if (node.type === "link") {
        element.setAttribute("href", node.href);
        element.setAttribute("rel", "noopener noreferrer");
        if (node.title) element.setAttribute("title", node.title);
      }
      if (node.type === "list" && node.ordered && node.start !== 1) element.setAttribute("start", String(node.start));
      if (node.type === "listItem" && typeof node.checked === "boolean") {
        element.className = "mn-task-item";
        const marker = doc.createElement("span");
        marker.className = "mn-task-marker";
        marker.textContent = node.checked ? "☑ " : "☐ ";
        element.appendChild(marker);
      }
      if (node.type === "codeBlock") {
        const code = doc.createElement("code");
        if (node.language) code.className = "language-" + node.language;
        code.textContent = node.value;
        element.appendChild(code);
      } else if (node.value !== undefined) element.textContent = node.value;
      else if (node.children) append(doc, element, node.children, options);
      parent.appendChild(element);
    }
  }

  function render(doc, source, options = {}) {
    const fragment = doc.createDocumentFragment();
    append(doc, fragment, parse(source), options);
    return fragment;
  }

  return { parse, render, safeURL, hasRichText };
});
