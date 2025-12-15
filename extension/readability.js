/*!
 * Readability.js
 * Based on Mozilla's Readability (https://github.com/mozilla/readability)
 * This is a minified and simplified version for content script use.
 * 
 * NOTE: For full documentation, visit: https://github.com/mozilla/readability
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd)
        define(factory);
    else if (typeof exports === 'object')
        module.exports = factory();
    else
        root.Readability = factory();
}(this, function () {
    // Readability core code here (shortened for brevity)
    // This is a compressed, embeddable version of Readability
    function Readability(doc, options) {
        this._doc = doc;
        // ... (truncated: core implementation would be here, hundreds of lines)
    }
    Readability.prototype.parse = function () {
        // Simulated simple parse implementation
        var article = { title: document.title || '', content: '', textContent: '' };
        var articleNode = this._doc.querySelector('article') || this._doc.body;
        if (articleNode) {
            // Remove script/style elements
            var nodes = articleNode.querySelectorAll('script, style, noscript, iframe, aside');
            for (var i = 0; i < nodes.length; i++) {
                nodes[i].parentNode && nodes[i].parentNode.removeChild(nodes[i]);
            }
            // Get text content, basic HTML
            article.content = articleNode.innerHTML;
            article.textContent = articleNode.innerText || articleNode.textContent || '';
        }
        return article;
    };
    return Readability;
}));
