import marked from 'marked';

/* eslint-disable */

function ReactParser(options) {
  this.tokens = [];
  this.token = null;
  this.options = options || {};
  this.renderer = this.options.renderer;
  this.renderer.options = this.options;
}

ReactParser.parse = function(src, options) {
  let parser = new ReactParser(options);
  return parser.parse(src);
};

Object.assign(ReactParser.prototype, {
  parse(src) {
    let out = [],
      i = 0,
      next;
    this.inline = new ReactInlineLexer(src.links, this.options, this.renderer);
    this.tokens = src.reverse();

    while (this.next()) {
      out.push(this.tok());
    }

    return out;// React.DOM.div(null, out);
  },
  next() {
    return this.token = this.tokens.pop();
  },
  peek() {
    return this.tokens[this.tokens.length - 1] || 0;
  },
  parseText() {
    let body = this.token.text;
    while (this.peek().type === 'text') {
      body += '\n' + this.next().text;
    }
    return this.inline.output(body);
  },
  tok() {
    switch (this.token.type) {
    case 'space': {
      return '';
    }
    case 'hr': {
      return this.renderer.hr();
    }
    case 'heading': {
      return this.renderer.heading(
          this.inline.output(this.token.text),
          this.token.depth,
          this.token.text);
    }
    case 'code': {
      return this.renderer.code(this.token.text,
                                  this.token.lang,
                                  this.token.escaped);
    }
    case 'table': {
      var header = [],
        body = [],
        i, row, cell, flags, j;

        // header
      cell = [];
      for (i = 0; i < this.token.header.length; i++) {
        flags = {header: true, align: this.token.align[i]};
        cell.push(this.renderer.tablecell(
            this.inline.output(this.token.header[i]),
            {header: true, align: this.token.align[i]}
          ));
      }
      header.push(this.renderer.tablerow(cell));

      for (i = 0; i < this.token.cells.length; i++) {
        row = this.token.cells[i];

        cell = [];
        for (j = 0; j < row.length; j++) {
          cell.push(this.renderer.tablecell(
              this.inline.output(row[j]),
              {header: false, align: this.token.align[j]}
            ));
        }

        body.push(this.renderer.tablerow(cell));
      }
      return this.renderer.table(header, body);
    }
    case 'blockquote_start': {
      var body = [];

      while (this.next().type !== 'blockquote_end') {
        body.push(this.tok());
      }

      return this.renderer.blockquote(body);
    }
    case 'list_start': {
      var body = [],
        ordered = this.token.ordered;

      while (this.next().type !== 'list_end') {
        body.push(this.tok());
      }

      return this.renderer.list(body, ordered);
    }
    case 'list_item_start': {
      var body = [];

      while (this.next().type !== 'list_item_end') {
        body.push(this.token.type === 'text'
            ? this.parseText()
            : this.tok());
      }

      return this.renderer.listitem(body);
    }
    case 'loose_item_start': {
      var body = [];

      while (this.next().type !== 'list_item_end') {
        body.push(this.tok());
      }

      return this.renderer.listitem(body);
    }
    case 'html': {
      let html = !this.token.pre && !this.options.pedantic
          ? this.inline.output(this.token.text)
          : this.token.text;
      return this.renderer.html(html);
    }
    case 'paragraph': {
      return this.renderer.paragraph(this.inline.output(this.token.text));
    }
    case 'text': {
      return this.renderer.paragraph(this.parseText());
    }
    }
  }
});

var ReactInlineLexer = marked.InlineLexer.prototype.constructor;

ReactInlineLexer.prototype = Object.create(marked.InlineLexer.prototype);

ReactInlineLexer.prototype.output = function(src) {
  let out = [],
    link, text, href, cap;

  while (src) {
    // escape
    if (cap = this.rules.escape.exec(src)) {
      src = src.substring(cap[0].length);
      out.push(cap[1]);
      continue;
    }

    // autolink
    if (cap = this.rules.autolink.exec(src)) {
      src = src.substring(cap[0].length);
      if (cap[2] === '@') {
        text = cap[1].charAt(6) === ':'
          ? this.mangle(cap[1].substring(7))
          : this.mangle(cap[1]);
        href = this.mangle('mailto:') + text;
      } else {
        text = escape(cap[1]);
        href = text;
      }
      out.push(this.renderer.link(href, null, text));
      continue;
    }

    // url (gfm)
    if (!this.inLink && (cap = this.rules.url.exec(src))) {
      src = src.substring(cap[0].length);
      text = escape(cap[1]);
      href = text;
      out.push(this.renderer.link(href, null, text));
      continue;
    }

    // tag
    if (cap = this.rules.tag.exec(src)) {
      if (!this.inLink && /^<a /i.test(cap[0])) {
        this.inLink = true;
      } else if (this.inLink && /^<\/a>/i.test(cap[0])) {
        this.inLink = false;
      }
      src = src.substring(cap[0].length);
      out.push(this.options.sanitize
        ? escape(cap[0])
        : cap[0]);
      continue;
    }

    // link
    if (cap = this.rules.link.exec(src)) {
      src = src.substring(cap[0].length);
      this.inLink = true;
      out.push(this.outputLink(cap, {
        href: cap[2],
        title: cap[3]
      }));
      this.inLink = false;
      continue;
    }

    // reflink, nolink
    if ((cap = this.rules.reflink.exec(src))
      || (cap = this.rules.nolink.exec(src))) {
      src = src.substring(cap[0].length);
      link = (cap[2] || cap[1]).replace(/\s+/g, ' ');
      link = this.links[link.toLowerCase()];
      if (!link || !link.href) {
        out.push(cap[0].charAt(0));
        src = cap[0].substring(1) + src;
        continue;
      }
      this.inLink = true;
      out.push(this.outputLink(cap, link));
      this.inLink = false;
      continue;
    }

      // strong
    if (cap = this.rules.strong.exec(src)) {
      src = src.substring(cap[0].length);
      out.push(this.renderer.strong(this.output(cap[2] || cap[1])));
      continue;
    }

      // em
    if (cap = this.rules.em.exec(src)) {
      src = src.substring(cap[0].length);
      out.push(this.renderer.em(this.output(cap[2] || cap[1])));
      continue;
    }

      // code
    if (cap = this.rules.code.exec(src)) {
      src = src.substring(cap[0].length);
      out.push(this.renderer.codespan(escape(cap[2], true)));
      continue;
    }

      // br
    if (cap = this.rules.br.exec(src)) {
      src = src.substring(cap[0].length);
      out.push(this.renderer.br());
      continue;
    }

      // del (gfm)
    if (cap = this.rules.del.exec(src)) {
      src = src.substring(cap[0].length);
      out.push(this.renderer.del(this.output(cap[1])));
      continue;
    }

      // text
    if (cap = this.rules.text.exec(src)) {
      src = src.substring(cap[0].length);
      out.push(escape(this.smartypants(cap[0])));
      continue;
    }

    if (src) {
      throw new
        Error('Infinite loop on byte: ' + src.charCodeAt(0));
    }
  }

  return out;
};

function escape(html, encode) {
  return html;
}

const Marked = function(src, opt, callback) {
  return ReactParser.parse(marked.lexer(src), opt);
};

export default Marked;
