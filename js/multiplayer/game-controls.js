(function (window) {
  'use strict';

  function createControls() {
    var pressedKeys = {};

    function handleKeyChange(event, isPressed) {
      var key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(key) === -1) {
        return;
      }
      pressedKeys[key] = isPressed;
    }

    function move(player) {
      if (!player) return player;

      var moveX = 0;
      var moveZ = 0;
      if (pressedKeys.w || pressedKeys.arrowup) moveZ -= 1;
      if (pressedKeys.s || pressedKeys.arrowdown) moveZ += 1;
      if (pressedKeys.a || pressedKeys.arrowleft) moveX -= 1;
      if (pressedKeys.d || pressedKeys.arrowright) moveX += 1;
      if (!moveX && !moveZ) return player;

      var length = Math.sqrt(moveX * moveX + moveZ * moveZ) || 1;
      moveX /= length;
      moveZ /= length;

      player.x = Math.max(-7.5, Math.min(7.5, player.x + moveX * 0.09));
      player.z = Math.max(-4.5, Math.min(4.5, player.z + moveZ * 0.09));
      player.rotationY = Math.atan2(moveX, moveZ) + Math.PI;
      return player;
    }

    return {
      bind: function () {
        window.addEventListener('keydown', function (event) {
          handleKeyChange(event, true);
        });
        window.addEventListener('keyup', function (event) {
          handleKeyChange(event, false);
        });
      },
      move: move
    };
  }

  window.PintaGolGameControls = {
    createControls: createControls
  };
})(window);
