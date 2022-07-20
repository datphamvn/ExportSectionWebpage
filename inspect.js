/* globals chrome */
var xPathFinder = xPathFinder || (() => {
  class Inspector {
    constructor() {
      this.win = window;
      this.doc = window.document;

      this.draw = this.draw.bind(this);
      this.getData = this.getData.bind(this);
      this.setOptions = this.setOptions.bind(this);

      this.cssNode = 'xpath-css';
      this.contentNode = 'xpath-content';
      this.overlayElement = 'xpath-overlay';
    }

    getData(e, iframe) {
      e.stopImmediatePropagation();
      e.preventDefault && e.preventDefault();
      e.stopPropagation && e.stopPropagation();

      if (e.target.id !== this.contentNode) {
        this.XPath = this.getXPath(e.target);
        const contentNode = document.getElementById(this.contentNode);
        const iframeNode = window.frameElement || iframe;
        const contentString = iframeNode ? `Iframe: ${this.getXPath(iframeNode)}<br/>XPath: ${this.XPath}` : this.XPath;

        if (contentNode) {
          contentNode.innerHTML = contentString;
        } else {
          const contentHtml = document.createElement('div');
          contentHtml.innerHTML = contentString;
          contentHtml.id = this.contentNode;
          document.body.appendChild(contentHtml);
        }
        this.options.clipboard && (this.copyText(this.XPath));
      }
    }

    getOptions() {
      const storage = chrome.storage && (chrome.storage.local);
      const promise = storage.get({
        inspector: true,
        clipboard: true,
        shortid: false,
        position: 'bl'
      }, this.setOptions);
      (promise && promise.then) && (promise.then(this.setOptions()));
    }

    setOptions(options) {
      this.options = options;
      let position = 'bottom:0;left:0';
      switch (options.position) {
        case 'tl': position = 'top:0;left:0'; break;
        case 'tr': position = 'top:0;right:0'; break;
        case 'br': position = 'bottom:0;right:0'; break;
        default: break;
      }
      this.styles = `body *{cursor:crosshair!important;}#xpath-content{${position};cursor:initial!important;padding:10px;background:gray;color:white;position:fixed;font-size:14px;z-index:10000001;}`;
      this.activate();
    }

    createOverlayElements() {
      const overlayStyles = {
        background: 'rgba(120, 170, 210, 0.7)',
        padding: 'rgba(77, 200, 0, 0.3)',
        margin: 'rgba(255, 155, 0, 0.3)',
        border: 'rgba(255, 200, 50, 0.3)'
      };

      this.container = this.doc.createElement('div');
      this.node = this.doc.createElement('div');
      this.border = this.doc.createElement('div');
      this.padding = this.doc.createElement('div');
      this.content = this.doc.createElement('div');

      this.border.style.borderColor = overlayStyles.border;
      this.padding.style.borderColor = overlayStyles.padding;
      this.content.style.backgroundColor = overlayStyles.background;

      Object.assign(this.node.style, {
        borderColor: overlayStyles.margin,
        pointerEvents: 'none',
        position: 'fixed'
      });

      this.container.id = this.overlayElement;
      this.container.style.zIndex = 10000000;
      this.node.style.zIndex = 10000000;

      this.container.appendChild(this.node);
      this.node.appendChild(this.border);
      this.border.appendChild(this.padding);
      this.padding.appendChild(this.content);
    }

    removeOverlay() {
      const overlayHtml = document.getElementById(this.overlayElement);
      overlayHtml && overlayHtml.remove();
    }

    copyText(XPath) {
      const hdInp = document.createElement('textarea');
      hdInp.textContent = XPath;
      document.body.appendChild(hdInp);
      hdInp.select();
      document.execCommand('copy');
      hdInp.remove();
    }

    draw(e) {
      const node = e.target;
      if (node.id !== this.contentNode) {
        this.removeOverlay();

        const box = this.getNestedBoundingClientRect(node, this.win);
        const dimensions = this.getElementDimensions(node);

        this.boxWrap(dimensions, 'margin', this.node);
        this.boxWrap(dimensions, 'border', this.border);
        this.boxWrap(dimensions, 'padding', this.padding);

        Object.assign(this.content.style, {
          height: box.height - dimensions.borderTop - dimensions.borderBottom - dimensions.paddingTop - dimensions.paddingBottom + 'px',
          width: box.width - dimensions.borderLeft - dimensions.borderRight - dimensions.paddingLeft - dimensions.paddingRight + 'px',
        });

        Object.assign(this.node.style, {
          top: box.top - dimensions.marginTop + 'px',
          left: box.left - dimensions.marginLeft + 'px',
        });

        this.doc.body.appendChild(this.container);
      }
    }

    activate() {
      this.createOverlayElements();
      // add styles
      if (!document.getElementById(this.cssNode)) {
        const styles = document.createElement('style');
        styles.innerText = this.styles;
        styles.id = this.cssNode;
        document.getElementsByTagName('head')[0].appendChild(styles);
      }
      // add listeners for all frames and root
      document.addEventListener('click', this.getData, true);
      this.options.inspector && (document.addEventListener('mouseover', this.draw));
      const frameLength = window.parent.frames.length
      for (let i = 0; i < frameLength; i++) {
        let frame = window.parent.frames[i];
        frame.document.addEventListener('click', e => this.getData(e, frame.frameElement), true);
        this.options.inspector && (frame.document.addEventListener('mouseover', this.draw));
      }

    }

    deactivate() {
      // remove styles
      const cssNode = document.getElementById(this.cssNode);
      cssNode && cssNode.remove();
      // remove overlay
      this.removeOverlay();
      // remove xpath html
      const contentNode = document.getElementById(this.contentNode);
      contentNode && contentNode.remove();
      // remove listeners for all frames and root
      document.removeEventListener('click', this.getData, true);
      this.options && this.options.inspector && (document.removeEventListener('mouseover', this.draw));
      const frameLength = window.parent.frames.length
      for (let i = 0; i < frameLength; i++) {
        let frameDocument = window.parent.frames[i].document
        frameDocument.removeEventListener('click', this.getData, true);
        this.options && this.options.inspector && (frameDocument.removeEventListener('mouseover', this.draw));
      }

    }

    getXPath(el) {
      let nodeElem = el;
      if (nodeElem.id && this.options.shortid) {
        return `//*[@id="${nodeElem.id}"]`;
      }
      const parts = [];
      while (nodeElem && nodeElem.nodeType === Node.ELEMENT_NODE) {
        let nbOfPreviousSiblings = 0;
        let hasNextSiblings = false;
        let sibling = nodeElem.previousSibling;
        while (sibling) {
          if (sibling.nodeType !== Node.DOCUMENT_TYPE_NODE && sibling.nodeName === nodeElem.nodeName) {
            nbOfPreviousSiblings++;
          }
          sibling = sibling.previousSibling;
        }
        sibling = nodeElem.nextSibling;
        while (sibling) {
          if (sibling.nodeName === nodeElem.nodeName) {
            hasNextSiblings = true;
            break;
          }
          sibling = sibling.nextSibling;
        }
        const prefix = nodeElem.prefix ? nodeElem.prefix + ':' : '';
        const nth = nbOfPreviousSiblings || hasNextSiblings ? `[${nbOfPreviousSiblings + 1}]` : '';
        parts.push(prefix + nodeElem.localName + nth);
        nodeElem = nodeElem.parentNode;
      }
      return parts.length ? '/' + parts.reverse().join('/') : '';
    }

    getElementDimensions(domElement) {
      const calculatedStyle = window.getComputedStyle(domElement);
      return {
        borderLeft: +calculatedStyle.borderLeftWidth.match(/[0-9]*/)[0],
        borderRight: +calculatedStyle.borderRightWidth.match(/[0-9]*/)[0],
        borderTop: +calculatedStyle.borderTopWidth.match(/[0-9]*/)[0],
        borderBottom: +calculatedStyle.borderBottomWidth.match(/[0-9]*/)[0],
        marginLeft: +calculatedStyle.marginLeft.match(/[0-9]*/)[0],
        marginRight: +calculatedStyle.marginRight.match(/[0-9]*/)[0],
        marginTop: +calculatedStyle.marginTop.match(/[0-9]*/)[0],
        marginBottom: +calculatedStyle.marginBottom.match(/[0-9]*/)[0],
        paddingLeft: +calculatedStyle.paddingLeft.match(/[0-9]*/)[0],
        paddingRight: +calculatedStyle.paddingRight.match(/[0-9]*/)[0],
        paddingTop: +calculatedStyle.paddingTop.match(/[0-9]*/)[0],
        paddingBottom: +calculatedStyle.paddingBottom.match(/[0-9]*/)[0]
      };
    }

    getOwnerWindow(node) {
      if (!node.ownerDocument) { return null; }
      return node.ownerDocument.defaultView;
    }

    getOwnerIframe(node) {
      const nodeWindow = this.getOwnerWindow(node);
      if (nodeWindow) {
        return nodeWindow.frameElement;
      }
      return null;
    }

    getBoundingClientRectWithBorderOffset(node) {
      const dimensions = this.getElementDimensions(node);
      return this.mergeRectOffsets([
        node.getBoundingClientRect(),
        {
          top: dimensions.borderTop,
          left: dimensions.borderLeft,
          bottom: dimensions.borderBottom,
          right: dimensions.borderRight,
          width: 0,
          height: 0
        }
      ]);
    }

    mergeRectOffsets(rects) {
      return rects.reduce((previousRect, rect) => {
        if (previousRect === null) { return rect; }
        return {
          top: previousRect.top + rect.top,
          left: previousRect.left + rect.left,
          width: previousRect.width,
          height: previousRect.height,
          bottom: previousRect.bottom + rect.bottom,
          right: previousRect.right + rect.right
        };
      });
    }

    getNestedBoundingClientRect(node, boundaryWindow) {
      const ownerIframe = this.getOwnerIframe(node);
      if (ownerIframe && ownerIframe !== boundaryWindow) {
        const rects = [node.getBoundingClientRect()];
        let currentIframe = ownerIframe;
        let onlyOneMore = false;
        while (currentIframe) {
          const rect = this.getBoundingClientRectWithBorderOffset(currentIframe);
          rects.push(rect);
          currentIframe = this.getOwnerIframe(currentIframe);
          if (onlyOneMore) { break; }
          if (currentIframe && this.getOwnerWindow(currentIframe) === boundaryWindow) {
            onlyOneMore = true;
          }
        }
        return this.mergeRectOffsets(rects);
      }
      return node.getBoundingClientRect();
    }

    boxWrap(dimensions, parameter, node) {
      Object.assign(node.style, {
        borderTopWidth: dimensions[parameter + 'Top'] + 'px',
        borderLeftWidth: dimensions[parameter + 'Left'] + 'px',
        borderRightWidth: dimensions[parameter + 'Right'] + 'px',
        borderBottomWidth: dimensions[parameter + 'Bottom'] + 'px',
        borderStyle: 'solid'
      });
    }
  }

  const inspect = new Inspector();

  chrome.runtime.onMessage.addListener(request => {
    if (request.action === 'activate') {
      return inspect.getOptions();
    }
    return inspect.deactivate();
  });

  return true;
})();

var getSourceCode = function () {
  var sourceCode = document.getElementsByTagName('html')[0].outerHTML;
  return fixRelativePath(sourceCode);
}

chrome.runtime.sendMessage(getSourceCode());

function rel_to_abs(url) {
  if (/^((https?|file|ftps?|mailto|javascript):|(data:image\/[^;]{2,9};))/i.test(url))
    return url;

  var base_url = location.href.match(/^(.+)\/?(?:#.+)?$/)[0] + "/";
  if (url.substring(0, 2) == "//")
    return location.protocol + url;
  else if (url.charAt(0) == "/")
    return location.protocol + "//" + location.host + url;
  else if (url.substring(0, 2) == "./")
    url = "." + url;
  else if (/^\s*$/.test(url))
    return "";
  else url = "../" + url;

  url = base_url + url;
  var i = 0
  while (/\/\.\.\//.test(url = url.replace(/[^\/]+\/+\.\.\//g, "")));

  /* Escape certain characters to prevent XSS */
  url = url.replace(/\.$/, "").replace(/\/\./g, "").replace(/"/g, "%22")
    .replace(/'/g, "%27").replace(/</g, "%3C").replace(/>/g, "%3E");
  return url;
}

function fixRelativePath(html) {
  var att = "[^-a-z0-9:._]";

  var entityEnd = "(?:;|(?!\\d))";
  var ents = {
    " ": "(?:\\s|&nbsp;?|&#0*32" + entityEnd + "|&#x0*20" + entityEnd + ")",
    "(": "(?:\\(|&#0*40" + entityEnd + "|&#x0*28" + entityEnd + ")",
    ")": "(?:\\)|&#0*41" + entityEnd + "|&#x0*29" + entityEnd + ")",
    ".": "(?:\\.|&#0*46" + entityEnd + "|&#x0*2e" + entityEnd + ")"
  };

  var charMap = {};
  var s = ents[" "] + "*";
  var any = "(?:[^>\"']*(?:\"[^\"]*\"|'[^']*'))*?[^>]*";

  function ae(string) {
    var all_chars_lowercase = string.toLowerCase();
    if (ents[string]) return ents[string];
    var all_chars_uppercase = string.toUpperCase();
    var RE_res = "";
    for (var i = 0; i < string.length; i++) {
      var char_lowercase = all_chars_lowercase.charAt(i);
      if (charMap[char_lowercase]) {
        RE_res += charMap[char_lowercase];
        continue;
      }
      var char_uppercase = all_chars_uppercase.charAt(i);
      var RE_sub = [char_lowercase];
      RE_sub.push("&#0*" + char_lowercase.charCodeAt(0) + entityEnd);
      RE_sub.push("&#x0*" + char_lowercase.charCodeAt(0).toString(16) + entityEnd);
      if (char_lowercase != char_uppercase) {
        RE_sub.push("&#0*" + char_uppercase.charCodeAt(0) + entityEnd);
        RE_sub.push("&#x0*" + char_uppercase.charCodeAt(0).toString(16) + entityEnd);
      }
      RE_sub = "(?:" + RE_sub.join("|") + ")";
      RE_res += (charMap[char_lowercase] = RE_sub);
    }
    return (ents[string] = RE_res);
  }

  function by(match, group1, group2, group3) {
    return group1 + rel_to_abs(group2) + group3;
  }

  var slashRE = new RegExp(ae("/"), 'g');
  var dotRE = new RegExp(ae("."), 'g');
  function by2(match, group1, group2, group3) {

    group2 = group2.replace(slashRE, "/").replace(dotRE, ".");
    return group1 + rel_to_abs(group2) + group3;
  }

  function cr(selector, attribute, marker, delimiter, end) {
    if (typeof selector == "string") selector = new RegExp(selector, "gi");
    attribute = att + attribute;
    marker = typeof marker == "string" ? marker : "\\s*=\\s*";
    delimiter = typeof delimiter == "string" ? delimiter : "";
    end = typeof end == "string" ? "?)(" + end : ")(";
    var re1 = new RegExp('(' + attribute + marker + '")([^"' + delimiter + ']+' + end + ')', 'gi');
    var re2 = new RegExp("(" + attribute + marker + "')([^'" + delimiter + "]+" + end + ")", 'gi');
    var re3 = new RegExp('(' + attribute + marker + ')([^"\'][^\\s>' + delimiter + ']*' + end + ')', 'gi');
    html = html.replace(selector, function (match) {
      return match.replace(re1, by).replace(re2, by).replace(re3, by);
    });
  }

  function cri(selector, attribute, front, flags, delimiter, end) {
    if (typeof selector == "string") selector = new RegExp(selector, "gi");
    attribute = att + attribute;
    flags = typeof flags == "string" ? flags : "gi";
    var re1 = new RegExp('(' + attribute + '\\s*=\\s*")([^"]*)', 'gi');
    var re2 = new RegExp("(" + attribute + "\\s*=\\s*')([^']+)", 'gi');
    var at1 = new RegExp('(' + front + ')([^"]+)(")', flags);
    var at2 = new RegExp("(" + front + ")([^']+)(')", flags);
    if (typeof delimiter == "string") {
      end = typeof end == "string" ? end : "";
      var at3 = new RegExp("(" + front + ")([^\"'][^" + delimiter + "]*" + (end ? "?)(" + end + ")" : ")()"), flags);
      var handleAttr = function (match, g1, g2) { return g1 + g2.replace(at1, by2).replace(at2, by2).replace(at3, by2) };
    } else {
      var handleAttr = function (match, g1, g2) { return g1 + g2.replace(at1, by2).replace(at2, by2) };
    }
    html = html.replace(selector, function (match) {
      return match.replace(re1, handleAttr).replace(re2, handleAttr);
    });
  }


  cri("<meta" + any + att + "http-equiv\\s*=\\s*(?:\"" + ae("refresh") + "\"" + any + ">|'" + ae("refresh") + "'" + any + ">|" + ae("refresh") + "(?:" + ae(" ") + any + ">|>))", "content", ae("url") + s + ae("=") + s, "i");

  cr("<" + any + att + "href\\s*=" + any + ">", "href");
  cr("<" + any + att + "src\\s*=" + any + ">", "src");

  cr("<object" + any + att + "data\\s*=" + any + ">", "data");
  cr("<applet" + any + att + "codebase\\s*=" + any + ">", "codebase");


  cr("<param" + any + att + "name\\s*=\\s*(?:\"" + ae("movie") + "\"" + any + ">|'" + ae("movie") + "'" + any + ">|" + ae("movie") + "(?:" + ae(" ") + any + ">|>))", "value");

  cr(/<style[^>]*>(?:[^"']*(?:"[^"]*"|'[^']*'))*?[^'"]*(?:<\/style|$)/gi, "url", "\\s*\\(\\s*", "", "\\s*\\)");
  cri("<" + any + att + "style\\s*=" + any + ">", "style", ae("url") + s + ae("(") + s, 0, s + ae(")"), ae(")"));
  return html;
}