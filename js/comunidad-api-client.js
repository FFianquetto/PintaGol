/**
 * Cliente HTTP para la API de Comunidad (publicaciones y comentarios).
 */
(function () {
  'use strict';

  function jsonWithStatus(r) {
    return r.json().then(function (data) {
      var o = data && typeof data === 'object' ? data : {};
      o._httpStatus = r.status;
      return o;
    });
  }

  function listPublicaciones() {
    return fetch('/api/comunidad/publicaciones').then(function (r) {
      return jsonWithStatus(r);
    });
  }

  function createPublicacion(accessToken, texto, fileInput) {
    var fd = new FormData();
    fd.append('accessToken', accessToken);
    fd.append('texto', texto != null ? String(texto) : '');
    if (fileInput && fileInput.files && fileInput.files[0]) {
      fd.append('imagen', fileInput.files[0]);
    }
    return fetch('/api/comunidad/publicaciones', { method: 'POST', body: fd }).then(function (r) {
      return jsonWithStatus(r);
    });
  }

  function deletePublicacion(pubId, metaUserId) {
    return fetch('/api/comunidad/publicaciones/' + pubId, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta_user_id: String(metaUserId || '').trim() })
    }).then(function (r) {
      return jsonWithStatus(r);
    });
  }

  function listComentarios(pubId) {
    return fetch('/api/comunidad/publicaciones/' + pubId + '/comentarios').then(function (r) {
      return jsonWithStatus(r);
    });
  }

  function createComentario(pubId, accessToken, texto) {
    return fetch('/api/comunidad/publicaciones/' + pubId + '/comentarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: accessToken, texto: texto })
    }).then(function (r) {
      return jsonWithStatus(r);
    });
  }

  function setFacebookEnlace(pubId, accessToken, facebookEnlace) {
    return fetch('/api/comunidad/publicaciones/' + pubId + '/facebook-enlace', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: accessToken,
        facebook_enlace: String(facebookEnlace || '').trim()
      })
    }).then(function (r) {
      return jsonWithStatus(r);
    });
  }

  window.PintaGolComunidadApi = {
    listPublicaciones: listPublicaciones,
    createPublicacion: createPublicacion,
    deletePublicacion: deletePublicacion,
    listComentarios: listComentarios,
    createComentario: createComentario,
    setFacebookEnlace: setFacebookEnlace
  };
})();
