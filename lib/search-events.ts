/** Lets any page open the tool search palette owned by the top bar. */
export const OPEN_TOOL_SEARCH_EVENT = 'jhtoolbox:open-tool-search';

export function openToolSearch(): void {
  window.dispatchEvent(new Event(OPEN_TOOL_SEARCH_EVENT));
}
