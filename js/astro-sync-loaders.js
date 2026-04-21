export function loadFirstWithFallback(urls, loader, onLoad, onFail) {
  let index = 0;

  function next() {
    if (index >= urls.length) {
      if (onFail) onFail();
      return;
    }
    loader.load(
      urls[index++],
      (model) => onLoad(model),
      undefined,
      next
    );
  }

  next();
}
