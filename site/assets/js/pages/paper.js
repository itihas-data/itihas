// Paper: the two citations and their copy buttons. Everything else on the page is static.
import { CITE, CITE_PAPER, copyButton } from "../core.js";

const $ = (id) => document.getElementById(id);
$("paper-cite").textContent = CITE_PAPER;
copyButton($("paper-copy"), () => CITE_PAPER);
$("cite-text").textContent = CITE;
copyButton($("cite-copy"), () => CITE);
