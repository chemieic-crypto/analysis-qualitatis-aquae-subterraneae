import L from "leaflet";

/**
 * Patches a Leaflet instance to make it resilient against unmounting and animation race conditions
 * (such as "Cannot read properties of undefined (reading '_leaflet_pos')").
 */
export function patchLeafletInstance(leafletObj: any) {
  if (!leafletObj) return;
  if (leafletObj.__is_resiliently_patched) return;
  leafletObj.__is_resiliently_patched = true;

  const createSafePoint = (x = 0, y = 0) => {
    if (leafletObj.point) return leafletObj.point(x, y);
    if (L.point) return L.point(x, y);
    return {
      x,
      y,
      _round: function () { return this; },
      _add: function (p: any) { return p; },
      _subtract: function (p: any) { return p; },
      _divideBy: function () { return this; },
      _multiplyBy: function () { return this; }
    };
  };

  // 1. Guard DomUtil.getPosition against null/undefined elements
  if (leafletObj.DomUtil) {
    const origGetPosition = leafletObj.DomUtil.getPosition;
    leafletObj.DomUtil.getPosition = function (el: any) {
      if (!el) {
        return createSafePoint(0, 0);
      }
      try {
        const pos = origGetPosition ? origGetPosition.call(this, el) : el._leaflet_pos;
        return pos || createSafePoint(0, 0);
      } catch {
        return createSafePoint(0, 0);
      }
    };
  }

  // 2. Guard Map.prototype._getMapPanePos against unmounted/missing mapPane
  if (leafletObj.Map && leafletObj.Map.prototype) {
    const proto = leafletObj.Map.prototype;

    const origGetMapPanePos = proto._getMapPanePos;
    proto._getMapPanePos = function () {
      if (!this._mapPane) {
        return createSafePoint(0, 0);
      }
      try {
        const pos = origGetMapPanePos ? origGetMapPanePos.call(this) : null;
        return pos || createSafePoint(0, 0);
      } catch {
        return createSafePoint(0, 0);
      }
    };

    // 3. Guard _onZoomTransitionEnd if map was destroyed while animation was in-flight
    const origOnZoomTransitionEnd = proto._onZoomTransitionEnd;
    proto._onZoomTransitionEnd = function () {
      if (!this._mapPane || !this._loaded) {
        return;
      }
      try {
        if (origOnZoomTransitionEnd) {
          origOnZoomTransitionEnd.call(this);
        }
      } catch (err) {
        // Suppress transition end errors during unmounting
      }
    };

    // 4. Guard _move against missing mapPane and preserve method chaining (MUST return this)
    const origMove = proto._move;
    proto._move = function (newCenter: any, newZoom: any, data: any, flags: any) {
      if (!this._mapPane) {
        return this;
      }
      try {
        if (origMove) {
          const res = origMove.call(this, newCenter, newZoom, data, flags);
          return res !== undefined ? res : this;
        }
      } catch (err) {
        // Suppress move errors during unmounting
      }
      return this;
    };

    // 5. Guard _moveStart and preserve method chaining
    const origMoveStart = proto._moveStart;
    proto._moveStart = function (zoomChanged: any, noMoveStart: any) {
      try {
        if (origMoveStart) {
          const res = origMoveStart.call(this, zoomChanged, noMoveStart);
          return res !== undefined ? res : this;
        }
      } catch (err) {
        // Suppress moveStart errors during unmounting
      }
      return this;
    };

    // 6. Guard _moveEnd and preserve method chaining
    const origMoveEnd = proto._moveEnd;
    proto._moveEnd = function (zoomChanged: any) {
      try {
        if (origMoveEnd) {
          const res = origMoveEnd.call(this, zoomChanged);
          return res !== undefined ? res : this;
        }
      } catch (err) {
        // Suppress moveEnd errors during unmounting
      }
      return this;
    };
  }
}

// Patch the bundled Leaflet module immediately
patchLeafletInstance(L);

// Expose on window & globalThis and patch global window.L as well
if (typeof window !== "undefined") {
  (window as any).L = L;
  patchLeafletInstance((window as any).L);

  // If a script tag (e.g. from unpkg) re-defines window.L later, patch it as well
  let currentWindowL = (window as any).L;
  Object.defineProperty(window, "L", {
    configurable: true,
    enumerable: true,
    get() {
      return currentWindowL;
    },
    set(newVal) {
      currentWindowL = newVal;
      patchLeafletInstance(newVal);
    }
  });
}

if (typeof globalThis !== "undefined") {
  (globalThis as any).L = L;
}

export default L;
