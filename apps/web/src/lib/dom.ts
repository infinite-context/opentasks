export function getAppRoot(): HTMLDivElement {
  const root = document.querySelector<HTMLDivElement>("#app");

  if (!root) {
    throw new Error("App root element not found.");
  }

  return root;
}
