// Without a loading state here, a click to another page waits for this slot's server render before showing anything,
// so the page's own loading.tsx skeleton never appears. Nothing to show while the modal loads.
export default function Loading() {
  return null;
}
