/**
 * Feed de comunidad: carga desde MySQL, formulario de publicación y comentarios.
 */
(function () {
  'use strict';

  var meta = window.PintaGolComunidadMeta;
  var api = window.PintaGolComunidadApi;
  var listEl = null;
  var statusEl = null;
  var formEl = null;
  var fileInput = null;
  var textoInput = null;
  var btnPublicar = null;
  var avisoFbEl = null;
  var fotoNombreEl = null;
  var modalBorrar = null;
  var modalBorrarConfirm = null;
  var pendingBorrar = null;

  function clearTokenIfUnauthorized(data) {
    if (!data) return;
    if (data._httpStatus === 401 || data.reason === 'invalid_token') {
      if (meta.invalidateFbSessionCache) meta.invalidateFbSessionCache();
    }
  }

  function cerrarModalBorrar() {
    if (!modalBorrar) return;
    modalBorrar.setAttribute('hidden', '');
    pendingBorrar = null;
    document.removeEventListener('keydown', onModalBorrarKeydown);
  }

  function onModalBorrarKeydown(ev) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      cerrarModalBorrar();
    }
  }

  function abrirModalBorrar(pub, article) {
    pendingBorrar = { pub: pub, article: article };
    if (modalBorrar) modalBorrar.removeAttribute('hidden');
    document.addEventListener('keydown', onModalBorrarKeydown);
    if (modalBorrarConfirm) modalBorrarConfirm.focus();
  }

  function syncFotoNombre() {
    if (!fotoNombreEl || !fileInput) return;
    var f = fileInput.files && fileInput.files[0];
    fotoNombreEl.textContent = f ? f.name : 'Ninguna imagen';
  }

  function setStatus(msg, isErr) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'comunidad-status' + (isErr ? ' comunidad-status-err' : '');
  }

  function formatFecha(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) {
      return '';
    }
  }

  function clearList() {
    if (!listEl) return;
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
  }

  function renderComentario(c) {
    var div = document.createElement('div');
    div.className = 'comunidad-comentario';
    var metaLine = document.createElement('div');
    metaLine.className = 'comunidad-comentario-meta';
    metaLine.textContent = (c.autor_nombre || 'Jugador') + ' · ' + formatFecha(c.creado_en);
    var body = document.createElement('p');
    body.className = 'comunidad-comentario-texto';
    body.textContent = c.cuerpo || '';
    div.appendChild(metaLine);
    div.appendChild(body);
    return div;
  }

  function loadComentariosInto(box, pubId) {
    box.innerHTML = '';
    var loading = document.createElement('p');
    loading.className = 'comunidad-comentarios-cargando';
    loading.textContent = 'Cargando comentarios…';
    box.appendChild(loading);
    api
      .listComentarios(pubId)
      .then(function (data) {
        box.innerHTML = '';
        if (!data || !data.ok) {
          clearTokenIfUnauthorized(data);
          var err = document.createElement('p');
          err.className = 'comunidad-status-err';
          err.textContent = (data && data.message) || 'No se pudieron cargar los comentarios.';
          box.appendChild(err);
          return;
        }
        var arr = data.comentarios || [];
        if (!arr.length) {
          var vacio = document.createElement('p');
          vacio.className = 'comunidad-comentarios-vacio';
          vacio.textContent = 'Aún no hay comentarios. Sé el primero.';
          box.appendChild(vacio);
        } else {
          arr.forEach(function (c) {
            box.appendChild(renderComentario(c));
          });
        }
      })
      .catch(function () {
        box.innerHTML = '';
        var err = document.createElement('p');
        err.className = 'comunidad-status-err';
        err.textContent = 'Error de red al cargar comentarios.';
        box.appendChild(err);
      });
  }

  function bindComentariosUi(article, pub) {
    var toggle = article.querySelector('.comunidad-btn-comentarios');
    var panel = article.querySelector('.comunidad-comentarios-panel');
    var form = article.querySelector('.comunidad-form-comentario');
    var inp = article.querySelector('.comunidad-input-comentario');
    var btn = article.querySelector('.comunidad-btn-enviar-comentario');
    var listBox = article.querySelector('.comunidad-comentarios-lista');
    var opened = false;

    if (toggle && panel) {
      toggle.addEventListener('click', function () {
        var vis = panel.getAttribute('hidden') == null;
        if (vis) {
          panel.setAttribute('hidden', '');
          toggle.setAttribute('aria-expanded', 'false');
        } else {
          panel.removeAttribute('hidden');
          toggle.setAttribute('aria-expanded', 'true');
          if (!opened) {
            opened = true;
            loadComentariosInto(listBox, pub.id);
          }
        }
      });
    }

    if (btn && inp && form) {
      btn.addEventListener('click', function () {
        var texto = (inp.value || '').trim();
        if (!texto) {
          setStatus('Escribe un comentario.', true);
          return;
        }
        if (!meta.isFacebookLinked()) {
          setStatus('Vincula Facebook en Redes sociales para comentar.', true);
          return;
        }
        btn.disabled = true;
        meta
          .getAccessToken()
          .then(function (token) {
            return api.createComentario(pub.id, token, texto);
          })
          .then(function (data) {
            clearTokenIfUnauthorized(data);
            if (!data || !data.ok) {
              setStatus((data && data.message) || 'No se pudo publicar el comentario.', true);
              return;
            }
            inp.value = '';
            loadComentariosInto(listBox, pub.id);
            var n = (pub.num_comentarios || 0) + 1;
            pub.num_comentarios = n;
            if (toggle) toggle.textContent = 'Comentarios (' + n + ')';
            setStatus('Comentario publicado.');
          })
          .catch(function () {
            setStatus('Inicia sesión con Facebook para comentar.', true);
          })
          .finally(function () {
            btn.disabled = false;
          });
      });
    }
  }

  function renderPublicacion(pub) {
    var article = document.createElement('article');
    article.className = 'publicacion';

    var head = document.createElement('div');
    head.className = 'publicacion-cabecera';
    var autor = document.createElement('span');
    autor.className = 'publicacion-autor';
    autor.textContent = pub.autor_nombre || 'Jugador';
    var fecha = document.createElement('time');
    fecha.className = 'publicacion-fecha';
    fecha.dateTime = pub.creado_en || '';
    fecha.textContent = formatFecha(pub.creado_en);
    head.appendChild(autor);
    head.appendChild(fecha);

    var myUid = meta.getLocalMetaUserId ? meta.getLocalMetaUserId() : '';
    var rowBorrar = null;
    if (myUid && String(pub.meta_user_id) === String(myUid)) {
      rowBorrar = document.createElement('div');
      rowBorrar.className = 'publicacion-fila-borrar';
      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'comunidad-btn-eliminar';
      delBtn.textContent = 'Borrar mi publicación';
      delBtn.addEventListener('click', function () {
        onEliminarPublicacion(pub, article);
      });
      rowBorrar.appendChild(delBtn);
    }

    var cuerpo = document.createElement('div');
    cuerpo.className = 'publicacion-cuerpo';
    if (pub.cuerpo) {
      var p = document.createElement('p');
      p.textContent = pub.cuerpo;
      cuerpo.appendChild(p);
    }
    if (pub.imagen_url) {
      var fig = document.createElement('figure');
      fig.className = 'publicacion-fig';
      var img = document.createElement('img');
      img.src = pub.imagen_url;
      img.alt = 'Imagen de la publicación';
      img.loading = 'lazy';
      fig.appendChild(img);
      cuerpo.appendChild(fig);
    }

    var nCom = typeof pub.num_comentarios === 'number' ? pub.num_comentarios : 0;
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'comunidad-btn-comentarios';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = 'Comentarios (' + nCom + ')';

    var panel = document.createElement('div');
    panel.className = 'comunidad-comentarios-panel';
    panel.setAttribute('hidden', '');

    var listBox = document.createElement('div');
    listBox.className = 'comunidad-comentarios-lista';

    var form = document.createElement('div');
    form.className = 'comunidad-form-comentario';
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'comunidad-input-comentario';
    inp.placeholder = 'Escribe un comentario…';
    inp.maxLength = 1000;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'comunidad-btn-enviar-comentario';
    btn.textContent = 'Enviar';
    form.appendChild(inp);
    form.appendChild(btn);

    panel.appendChild(listBox);
    panel.appendChild(form);

    article.appendChild(head);
    if (rowBorrar) article.appendChild(rowBorrar);
    article.appendChild(cuerpo);
    article.appendChild(toggle);
    article.appendChild(panel);

    bindComentariosUi(article, pub);
    return article;
  }

  function renderLista(publicaciones) {
    clearList();
    if (!publicaciones || !publicaciones.length) {
      var p = document.createElement('p');
      p.className = 'comunidad-vacio';
      p.textContent = 'Aún no hay publicaciones. ¡Sé el primero en compartir algo con la comunidad!';
      listEl.appendChild(p);
      return;
    }
    publicaciones.forEach(function (pub) {
      listEl.appendChild(renderPublicacion(pub));
    });
  }

  function cargarFeed() {
    setStatus('Cargando…');
    api
      .listPublicaciones()
      .then(function (data) {
        if (!data || data.ok === false) {
          clearTokenIfUnauthorized(data);
          setStatus(
            (data && data.message) ||
              'No está disponible la comunidad. Revisa MySQL y el script sql/comunidad.sql.',
            true
          );
          clearList();
          return;
        }
        setStatus('');
        renderLista(data.publicaciones || []);
      })
      .catch(function () {
        setStatus('Error de red al cargar el feed.', true);
        clearList();
      });
  }

  function onEliminarPublicacion(pub, article) {
    var myUid = meta.getLocalMetaUserId ? meta.getLocalMetaUserId() : '';
    if (!myUid || String(pub.meta_user_id) !== String(myUid)) {
      setStatus('Solo puedes borrar publicaciones tuyas.', true);
      return;
    }
    abrirModalBorrar(pub, article);
  }

  function ejecutarBorradoPublicacion() {
    if (!pendingBorrar) return;
    var pub = pendingBorrar.pub;
    var article = pendingBorrar.article;
    var uid = meta.getLocalMetaUserId ? meta.getLocalMetaUserId() : '';
    if (!uid || String(pub.meta_user_id) !== String(uid)) {
      cerrarModalBorrar();
      setStatus('No se pudo verificar el autor de la publicación.', true);
      return;
    }
    cerrarModalBorrar();
    setStatus('Borrando…');
    api
      .deletePublicacion(pub.id, uid)
      .then(function (data) {
        if (!data || !data.ok) {
          setStatus((data && data.message) || 'No se pudo borrar.', true);
          return;
        }
        setStatus('Publicación eliminada.');
        if (article && article.parentNode) {
          article.parentNode.removeChild(article);
        }
      })
      .catch(function () {
        setStatus('No se pudo completar el borrado.', true);
      });
  }

  function onPublicar() {
    if (!meta.isFacebookLinked()) {
      setStatus('Primero vincula Facebook en «Redes sociales».', true);
      return;
    }
    var texto = textoInput ? (textoInput.value || '').trim() : '';
    var tieneFoto = fileInput && fileInput.files && fileInput.files[0];
    if (!texto && !tieneFoto) {
      setStatus('Escribe algo o adjunta una foto.', true);
      return;
    }
    setStatus('Publicando…');
    btnPublicar.disabled = true;
    meta
      .getAccessToken()
      .then(function (token) {
        return api.createPublicacion(token, texto, fileInput);
      })
      .then(function (data) {
        clearTokenIfUnauthorized(data);
        if (!data || !data.ok) {
          setStatus((data && data.message) || 'No se pudo publicar.', true);
          return;
        }
        if (textoInput) textoInput.value = '';
        if (fileInput) fileInput.value = '';
        syncFotoNombre();
        setStatus('¡Publicado!');
        cargarFeed();
      })
      .catch(function () {
        setStatus('Debes iniciar sesión con Facebook en la ventana emergente.', true);
      })
      .finally(function () {
        btnPublicar.disabled = false;
      });
  }

  function initDom() {
    listEl = document.getElementById('comunidad-feed-list');
    statusEl = document.getElementById('comunidad-feed-status');
    formEl = document.getElementById('comunidad-form-publicar');
    fileInput = document.getElementById('comunidad-foto');
    textoInput = document.getElementById('comunidad-texto');
    btnPublicar = document.getElementById('comunidad-btn-publicar');
    avisoFbEl = document.getElementById('comunidad-aviso-facebook');
    fotoNombreEl = document.getElementById('comunidad-foto-nombre');

    if (fileInput && fotoNombreEl) {
      fileInput.addEventListener('change', syncFotoNombre);
    }

    if (avisoFbEl) {
      avisoFbEl.hidden = meta.isFacebookLinked();
    }
    if (formEl) {
      formEl.hidden = !meta.isFacebookLinked();
    }
    if (btnPublicar) {
      btnPublicar.addEventListener('click', onPublicar);
    }

    modalBorrar = document.getElementById('comunidad-modal-borrar');
    modalBorrarConfirm = document.getElementById('comunidad-modal-borrar-confirmar');
    var modalCancel = document.getElementById('comunidad-modal-borrar-cancelar');
    var modalFondo = document.getElementById('comunidad-modal-borrar-fondo');
    if (modalBorrarConfirm) {
      modalBorrarConfirm.addEventListener('click', ejecutarBorradoPublicacion);
    }
    if (modalCancel) {
      modalCancel.addEventListener('click', cerrarModalBorrar);
    }
    if (modalFondo) {
      modalFondo.addEventListener('click', cerrarModalBorrar);
    }
  }

  function start() {
    if (!meta || !api) return;
    initDom();
    meta.initSdk(function (err) {
      if (err) {
        if (statusEl) {
          statusEl.textContent =
            'No se pudo cargar el inicio de sesión Meta. Configura redes-secrets.json y reinicia el servidor.';
          statusEl.className = 'comunidad-status comunidad-status-err';
        }
        return;
      }
      if (avisoFbEl) avisoFbEl.hidden = meta.isFacebookLinked();
      if (formEl) formEl.hidden = !meta.isFacebookLinked();
      if (meta.primeFbSessionIfConnected) {
        meta.primeFbSessionIfConnected(function () {
          cargarFeed();
        });
      } else {
        cargarFeed();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
