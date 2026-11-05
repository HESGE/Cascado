import { BOARD, WHEELS } from './geometry.js';

const HALF_DEPTH = 17;
const HUB_HEIGHT = 24;
const HUB_BASE = 16;
const HUB_TOP = 10;
const SEGMENTS = 24;
const CAMERA_DISTANCE = 850;

const VERTEX_SHADER = `
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_uv;
uniform mat4 u_rotation;
uniform vec3 u_projection;
uniform vec2 u_clip;
varying vec3 v_normal;
varying vec2 v_uv;
void main() {
  vec3 point = (u_rotation * vec4(a_position, 1.0)).xyz;
  float depth = u_projection.z - point.z;
  gl_Position = vec4(point.x * u_projection.x, point.y * u_projection.y,
    u_clip.x * depth + u_clip.y, depth);
  v_normal = (u_rotation * vec4(a_normal, 0.0)).xyz;
  v_uv = a_uv;
}`;

const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_texture;
uniform vec3 u_color;
uniform float u_textured;
varying vec3 v_normal;
varying vec2 v_uv;
void main() {
  vec3 light = normalize(vec3(-0.45, 0.6, 1.0));
  float shade = 0.55 + 0.45 * max(dot(normalize(v_normal), light), 0.0);
  vec3 color = mix(u_color * shade, texture2D(u_texture, v_uv).rgb, u_textured);
  gl_FragColor = vec4(color, 1.0);
}`;

function vertex(mesh, position, normal, uv = [0, 0]) {
  mesh.push(...position, ...normal, ...uv);
}

function quad(mesh, corners, normal, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
  for (const index of [0, 1, 2, 0, 2, 3]) vertex(mesh, corners[index], normal, uv[index]);
}

function boardGeometry() {
  const x = BOARD.width / 2;
  const y = BOARD.height / 2;
  const z = HALF_DEPTH;
  const front = [], back = [], sides = [];
  quad(front, [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], [0, 0, 1]);
  quad(back, [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z]],
    [0, 0, -1], [[1, 0], [0, 0], [0, 1], [1, 1]]);
  quad(sides, [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]], [-1, 0, 0]);
  quad(sides, [[x, -y, -z], [x, -y, z], [x, y, z], [x, y, -z]], [1, 0, 0]);
  quad(sides, [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]], [0, 1, 0]);
  quad(sides, [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]], [0, -1, 0]);
  return { front, back, sides };
}

function hubGeometry() {
  const mesh = [];
  const slope = (HUB_BASE - HUB_TOP) / HUB_HEIGHT;
  const normalLength = Math.hypot(1, slope);
  for (const side of [1, -1]) for (const wheel of WHEELS) {
    const x = wheel.x - BOARD.width / 2;
    const y = BOARD.height / 2 - wheel.y;
    const baseZ = side * HALF_DEPTH;
    const topZ = side * (HALF_DEPTH + HUB_HEIGHT);
    const point = (angle, radius, z) => [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z];
    const normal = angle => [Math.cos(angle) / normalLength, Math.sin(angle) / normalLength, side * slope / normalLength];
    for (let segment = 0; segment < SEGMENTS; segment++) {
      const a = segment * 2 * Math.PI / SEGMENTS;
      const b = (segment + 1) * 2 * Math.PI / SEGMENTS;
      const corners = [point(a, HUB_BASE, baseZ), point(b, HUB_BASE, baseZ),
        point(b, HUB_TOP, topZ), point(a, HUB_TOP, topZ)];
      for (const index of [0, 1, 2, 0, 2, 3]) vertex(mesh, corners[index], normal(index === 0 || index === 3 ? a : b));
      const capNormal = [0, 0, side];
      vertex(mesh, [x, y, topZ], capNormal);
      vertex(mesh, point(a, HUB_TOP, topZ), capNormal);
      vertex(mesh, point(b, HUB_TOP, topZ), capNormal);
    }
  }
  return mesh;
}

/** Real, depth-tested volumes for the independent rules illustration. The CSS
 * object remains the clock for its existing pause, flip and motion settings. */
export function mountRulesModel(stage, object) {
  const browser = stage?.ownerDocument?.defaultView;
  const faces = object?.querySelectorAll('.rules-preview-face .game-board');
  if (!browser || faces?.length !== 2 || !browser.requestAnimationFrame) return () => {};
  const canvas = stage.ownerDocument.createElement('canvas');
  canvas.className = 'rules-preview-model';
  canvas.setAttribute('aria-hidden', 'true');
  let gl;
  try { gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true }); }
  catch { return () => {}; }
  if (!gl) return () => {};

  const buffers = [], textures = [], shaders = [], images = new Set();
  let program = null;
  let frame = 0;
  let disposed = false;
  let previous = '';

  function cleanup() {
    if (disposed) return;
    disposed = true;
    browser.cancelAnimationFrame(frame);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    for (const pending of images) {
      pending.image.onload = pending.image.onerror = null;
      pending.image.src = '';
      browser.URL.revokeObjectURL(pending.url);
    }
    images.clear();
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    for (const texture of textures) gl.deleteTexture(texture);
    for (const shader of shaders) gl.deleteShader(shader);
    if (program) gl.deleteProgram(program);
    delete stage.dataset.previewRenderer;
    canvas.remove();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  function onContextLost(event) {
    event.preventDefault();
    cleanup();
  }

  function shader(type, source) {
    const compiled = gl.createShader(type);
    shaders.push(compiled);
    gl.shaderSource(compiled, source);
    gl.compileShader(compiled);
    if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) throw new Error('Preview shader unavailable');
    return compiled;
  }

  function mesh(data) {
    const buffer = gl.createBuffer();
    buffers.push(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return { buffer, count: data.length / 8 };
  }

  function texture(svg) {
    return new Promise((resolve, reject) => {
      const clone = svg.cloneNode(true);
      clone.querySelectorAll('.wheel-focus').forEach(node => node.remove());
      clone.setAttribute('font-family', 'system-ui, sans-serif');
      // Power-of-two textures allow mipmaps to keep oblique edges smooth.
      clone.setAttribute('width', '1024');
      clone.setAttribute('height', '1024');
      clone.setAttribute('preserveAspectRatio', 'none');
      const background = stage.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
      background.setAttribute('width', String(BOARD.width));
      background.setAttribute('height', String(BOARD.height));
      background.setAttribute('fill', '#12617B');
      clone.insertBefore(background, clone.firstChild);
      const label = stage.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
      label.innerHTML = '<rect x="135" y="9" width="90" height="28" rx="6" fill="#07384D"/><text x="180" y="29" text-anchor="middle" fill="#FFF9E9" font-size="14" font-weight="650"></text>';
      label.lastChild.textContent = svg.parentElement.querySelector('.rules-preview-face-label')?.textContent ?? '';
      clone.append(label);
      const source = new browser.XMLSerializer().serializeToString(clone);
      const image = new browser.Image();
      const url = browser.URL.createObjectURL(new browser.Blob([source], { type: 'image/svg+xml' }));
      const pending = { image, url };
      images.add(pending);
      const release = () => {
        images.delete(pending);
        image.onload = image.onerror = null;
        browser.URL.revokeObjectURL(url);
      };
      image.onerror = () => { release(); reject(new Error('Preview texture unavailable')); };
      image.onload = () => {
        release();
        if (disposed) return;
        try {
          const loaded = gl.createTexture();
          textures.push(loaded);
          gl.bindTexture(gl.TEXTURE_2D, loaded);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          resolve(loaded);
        } catch (error) { reject(error); }
      };
      image.src = url;
    });
  }

  canvas.addEventListener('webglcontextlost', onContextLost);
  try {
    program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Preview program unavailable');
    gl.useProgram(program);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    const attributes = ['a_position', 'a_normal', 'a_uv'].map(name => gl.getAttribLocation(program, name));
    attributes.forEach(location => gl.enableVertexAttribArray(location));
    const uniforms = Object.fromEntries(['u_rotation', 'u_projection', 'u_clip', 'u_color', 'u_textured']
      .map(name => [name, gl.getUniformLocation(program, name)]));
    const board = boardGeometry();
    const front = mesh(board.front), back = mesh(board.back), sides = mesh(board.sides), hubs = mesh(hubGeometry());
    const draw = (shape, color, surface = null) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, shape.buffer);
      gl.vertexAttribPointer(attributes[0], 3, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(attributes[1], 3, gl.FLOAT, false, 32, 12);
      gl.vertexAttribPointer(attributes[2], 2, gl.FLOAT, false, 32, 24);
      gl.uniform3fv(uniforms.u_color, color);
      gl.uniform1f(uniforms.u_textured, surface ? 1 : 0);
      if (surface) gl.bindTexture(gl.TEXTURE_2D, surface);
      gl.drawArrays(gl.TRIANGLES, 0, shape.count);
    };

    Promise.all([...faces].map(texture)).then(surfaces => {
      if (disposed) return;
      stage.append(canvas);
      stage.dataset.previewRenderer = 'webgl';
      function render() {
        if (!stage.isConnected) { cleanup(); return; }
        const width = stage.clientWidth, height = stage.clientHeight;
        const transform = browser.getComputedStyle(object).transform;
        const ratio = Math.min(browser.devicePixelRatio || 1, 2.5);
        const signature = `${width},${height},${ratio},${transform},${object.offsetWidth}`;
        if (width && height && object.offsetWidth && signature !== previous) {
          previous = signature;
          const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
          if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
          if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
          gl.viewport(0, 0, canvas.width, canvas.height);
          const match = transform.match(/^matrix3d\(([^)]+)\)$/);
          const matrix = match ? match[1].split(',').map(Number) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
          // CSS uses downward Y. Reflect both the input and output Y axes.
          const rotation = matrix.map((value, index) => value * (index % 4 === 1 ? -1 : 1) * (Math.floor(index / 4) === 1 ? -1 : 1));
          const distance = CAMERA_DISTANCE * BOARD.width / object.offsetWidth;
          const near = 10, far = distance + 2000;
          gl.uniformMatrix4fv(uniforms.u_rotation, false, new Float32Array(rotation));
          gl.uniform3f(uniforms.u_projection, 2 * CAMERA_DISTANCE / width, 2 * CAMERA_DISTANCE / height, distance);
          gl.uniform2f(uniforms.u_clip, (far + near) / (far - near), -2 * far * near / (far - near));
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          draw(sides, [0.07, 0.31, 0.37]);
          draw(front, [1, 1, 1], surfaces[0]);
          draw(back, [1, 1, 1], surfaces[1]);
          draw(hubs, [0.97, 0.97, 0.89]);
        }
        frame = browser.requestAnimationFrame(render);
      }
      render();
    }).catch(cleanup);
  } catch { cleanup(); }
  return cleanup;
}
