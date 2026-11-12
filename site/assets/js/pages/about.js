// About: the page is static. The module mounts the shell and points the repository links at REPO_URL,
// so the address lives in one place (core.js).
import { REPO_URL, icon } from "../core.js";

document.querySelectorAll("a[data-repo]").forEach((a) => {
  a.href = REPO_URL + (a.dataset.repo || "");
  if (a.classList.contains("more")) a.insertAdjacentHTML("beforeend", icon("external"));
});
