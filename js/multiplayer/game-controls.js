(function (window) {
  'use strict';

  function createControls() {
    var pressedKeys = {};

    function isMoveKey(event) {
      var c = event.code;
      if (c === 'KeyW' || c === 'KeyS' || c === 'KeyA' || c === 'KeyD' || c === 'ArrowUp' || c === 'ArrowDown' || c === 'ArrowLeft' || c === 'ArrowRight') {
        return true;
      }
      var k = (event.key || '').toLowerCase();
      return (k.length === 1 && 'wasd'.indexOf(k) >= 0) || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright';
    }

    function setMoveState(event, isPressed) {
      var c = event.code;
      if (c === 'KeyW' || c === 'ArrowUp') {
        pressedKeys.w = isPressed;
        return;
      }
      if (c === 'KeyS' || c === 'ArrowDown') {
        pressedKeys.s = isPressed;
        return;
      }
      if (c === 'KeyA' || c === 'ArrowLeft') {
        pressedKeys.a = isPressed;
        return;
      }
      if (c === 'KeyD' || c === 'ArrowRight') {
        pressedKeys.d = isPressed;
        return;
      }
      var k = (event.key || '').toLowerCase();
      if (k === 'w' || k === 'arrowup') pressedKeys.w = isPressed;
      else if (k === 's' || k === 'arrowdown') pressedKeys.s = isPressed;
      else if (k === 'a' || k === 'arrowleft') pressedKeys.a = isPressed;
      else if (k === 'd' || k === 'arrowright') pressedKeys.d = isPressed;
    }

    function move(player) {
      if (!player) return player;

      var moveX = 0;
      var moveZ = 0;
      if (pressedKeys.w) moveZ -= 1;
      if (pressedKeys.s) moveZ += 1;
      if (pressedKeys.a) moveX -= 1;
      if (pressedKeys.d) moveX += 1;
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
        function onKeyDown(event) {
          if (isMoveKey(event)) {
            event.preventDefault();
            setMoveState(event, true);
          }
        }
        function onKeyUp(event) {
          if (isMoveKey(event)) {
            event.preventDefault();
            setMoveState(event, false);
          }
        }
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('keyup', onKeyUp, true);
        window.addEventListener('blur', function () {
          pressedKeys = {};
        });
      },
      move: move
    };
  }

  window.PintaGolGameControls = {
    createControls: createControls
  };
})(window);
