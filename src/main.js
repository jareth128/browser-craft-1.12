import * as THREE from 'three';
import './style.css';

const root = document.querySelector('#world');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9c8c0');
scene.fog = new THREE.FogExp2('#a9c8c0', 0.018);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 150);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', 'First-person voxel world. Focus here to play with the keyboard.');
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
root.append(renderer.domElement);
renderer.domElement.addEventListener('pointerdown', () => renderer.domElement.focus());

scene.add(new THREE.HemisphereLight('#e7ffed', '#657866', 2.15));
const sun = new THREE.DirectionalLight('#fff1cf', 3.2);
sun.position.set(-20, 35, 18);
sun.castShadow = true;
scene.add(sun);

const materials = {
  grass: new THREE.MeshStandardMaterial({ color: '#78965b', roughness: 1 }),
  dirt: new THREE.MeshStandardMaterial({ color: '#8b6344', roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: '#858b84', roughness: 1 }),
  sand: new THREE.MeshStandardMaterial({ color: '#d8c88d', roughness: 1 }),
  wood: new THREE.MeshStandardMaterial({ color: '#95633b', roughness: 1 }),
  leaves: new THREE.MeshStandardMaterial({ color: '#527b4a', roughness: 1 }),
};
const types = Object.keys(materials);
const cube = new THREE.BoxGeometry(1, 1, 1);
const blockMap = new Map();
const instances = new Map();
const keyOf = (x, y, z) => `${x},${y},${z}`;
const blockKey = (x, y, z) => keyOf(Math.round(x), Math.round(y), Math.round(z));
const noise = (x, z) => (Math.sin(x * 0.21 + Math.cos(z * 0.17)) + Math.cos(z * 0.23 - x * 0.1)) * 1.8;
const heightAt = (x, z) => Math.floor(4 + noise(x, z) + Math.sin((x + z) * 0.07) * 2);

for (const type of types) {
  const mesh = new THREE.InstancedMesh(cube, materials[type], 9000);
  mesh.count = 0;
  mesh.userData.type = type;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  instances.set(type, mesh);
}
function rebuildInstances() {
  const counts = Object.fromEntries(types.map((type) => [type, 0]));
  const matrix = new THREE.Matrix4();
  for (const [key, type] of blockMap) {
    if (!type || !instances.has(type)) continue;
    const [x, y, z] = key.split(',').map(Number);
    matrix.makeTranslation(x, y, z);
    const id = counts[type]++;
    instances.get(type).setMatrixAt(id, matrix);
  }
  for (const type of types) {
    const mesh = instances.get(type);
    mesh.count = counts[type];
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.blockKeys = [];
  }
  for (const [key, type] of blockMap) {
    if (type) instances.get(type).userData.blockKeys.push(key);
  }
  for (const mesh of instances.values()) mesh.computeBoundingSphere();
}
function setBlock(x, y, z, type) {
  blockMap.set(blockKey(x, y, z), type);
}

for (let x = -17; x <= 17; x++) {
  for (let z = -17; z <= 17; z++) {
    const height = heightAt(x, z);
    for (let y = 0; y <= height; y++) {
      setBlock(x, y, z, y === height ? (height < 4 ? 'sand' : 'grass') : y > height - 3 ? 'dirt' : 'stone');
    }
    if ((Math.sin(x * 12.989 + z * 78.233) > 0.978) && (Math.abs(x) > 3 || Math.abs(z) > 3) && height >= 4) {
      for (let y = 1; y <= 4; y++) setBlock(x, height + y, z, 'wood');
      for (let y = 3; y <= 5; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) + Math.abs(dz) < 4 && !(dx === 0 && dz === 0 && y < 5)) setBlock(x + dx, height + y, z + dz, 'leaves');
      }
    }
  }
}
rebuildInstances();

function cloud(x, y, z, scale) {
  const group = new THREE.Group();
  for (const [dx, dy, size] of [[0, 0, 3], [2, .2, 2.1], [-2, -.1, 1.8], [.2, .9, 2]]) {
    const puff = new THREE.Mesh(new THREE.BoxGeometry(size, .7, 1.8), new THREE.MeshBasicMaterial({ color: '#eef3df', transparent: true, opacity: .8 }));
    puff.position.set(dx, dy, 0);
    group.add(puff);
  }
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  scene.add(group);
}
cloud(-15, 19, -25, 1.2);
cloud(18, 22, -32, .8);
cloud(29, 16, -10, .65);

const player = { x: 0, y: heightAt(0, 0) + 1.7, z: 0, yaw: Math.PI * .7, pitch: -.08, velocityY: 0, grounded: false, sprint: false };
camera.rotation.order = 'YXZ';
const raycaster = new THREE.Raycaster();
raycaster.far = 6;
const held = new Set();
const pressed = new Set();
const hotbarTypes = ['stone', 'dirt', 'grass', 'wood', 'leaves', 'sand', 'stone', 'dirt', 'wood'];
let selectedSlot = 0;
let paused = false;
let inventoryOpen = false;
let chatOpen = false;
let target = null;
let lastW = 0;
let lastFrame = performance.now();
let toastTimer;

const dbReady = new Promise((resolve) => {
  if (!('indexedDB' in window)) return resolve(null);
  const request = indexedDB.open('browser-craft-world', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('blocks', { keyPath: 'key' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => resolve(null);
});
async function saveEdit(key, type) {
  const db = await dbReady;
  if (!db) return;
  db.transaction('blocks', 'readwrite').objectStore('blocks').put({ key, type });
}
async function restoreEdits() {
  const db = await dbReady;
  if (!db) return;
  const request = db.transaction('blocks').objectStore('blocks').getAll();
  request.onsuccess = () => {
    for (const { key, type } of request.result) blockMap.set(key, type);
    rebuildInstances();
  };
}
restoreEdits();

function showToast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('visible'), 1800);
}
function renderHotbar() {
  const bar = document.querySelector('#hotbar');
  bar.innerHTML = '';
  hotbarTypes.forEach((type, index) => {
    const slot = document.createElement('button');
    slot.className = `hotbar-slot${index === selectedSlot ? ' selected' : ''}`;
    slot.setAttribute('aria-label', `Slot ${index + 1}: ${type}`);
    slot.innerHTML = `<span class="slot-number">${index + 1}</span><span class="block-icon ${type}"></span>${index === selectedSlot ? '<span class="item-count">32</span>' : ''}`;
    slot.addEventListener('click', () => { selectedSlot = index; renderHotbar(); });
    bar.append(slot);
  });
}
function renderInventory() {
  const grid = document.querySelector('#inventory-grid');
  const contents = [...hotbarTypes, ...Array.from({ length: 27 }, (_, i) => types[(i * 3 + 1) % types.length])];
  grid.innerHTML = contents.map((type) => `<button class="inventory-slot" title="${type}"><span class="block-icon ${type}"></span></button>`).join('');
}
renderHotbar();
renderInventory();
document.querySelector('#health-row').innerHTML = Array.from({ length: 10 }, () => '<span>♥</span>').join('');

function overlay(id, visible) { document.querySelector(id).classList.toggle('hidden', !visible); }
function closeTransient() {
  if (chatOpen) { chatOpen = false; overlay('#chat-screen', false); return true; }
  if (inventoryOpen) { inventoryOpen = false; overlay('#inventory-screen', false); return true; }
  if (paused) { paused = false; overlay('#pause-menu', false); return true; }
  return false;
}
function updateTarget() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  target = raycaster.intersectObjects([...instances.values()], false)[0] || null;
  const label = document.querySelector('#target-label');
  label.textContent = target ? target.object.userData.type.toUpperCase() : '';
  label.classList.toggle('visible', !!target);
}
function mine() {
  if (!target || target.instanceId === undefined) return;
  const type = target.object.userData.type;
  const key = target.object.userData.blockKeys[target.instanceId];
  if (!key || Number(key.split(',')[1]) <= 0) return;
  blockMap.set(key, null);
  saveEdit(key, null);
  rebuildInstances();
  showToast(`${type} mined`);
}
function place() {
  if (!target || target.instanceId === undefined) return;
  const key = target.object.userData.blockKeys[target.instanceId];
  const [x, y, z] = key.split(',').map(Number);
  const normal = target.face.normal.clone().transformDirection(target.object.matrixWorld);
  const position = [Math.round(x + normal.x), Math.round(y + normal.y), Math.round(z + normal.z)];
  const [px, py, pz] = position;
  if (blockMap.get(keyOf(px, py, pz))) return;
  if (Math.abs(px - player.x) < .8 && Math.abs(pz - player.z) < .8 && Math.abs(py - player.y) < 1.7) return;
  const blockType = hotbarTypes[selectedSlot];
  blockMap.set(keyOf(px, py, pz), blockType);
  saveEdit(keyOf(px, py, pz), blockType);
  rebuildInstances();
  showToast(`${blockType} placed`);
}

addEventListener('keydown', (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (chatOpen) {
    if (event.code === 'Escape') { closeTransient(); event.preventDefault(); }
    if (event.code === 'Enter') {
      const input = document.querySelector('#chat-input');
      if (input.value.trim()) document.querySelector('#chat-log').textContent = `You: ${input.value.trim()}`;
      input.value = '';
      closeTransient();
    }
    return;
  }
  if (event.repeat && ['KeyE', 'Escape', 'Enter'].includes(event.code)) return;
  if (event.code === 'Escape') { if (!closeTransient()) { paused = true; overlay('#pause-menu', true); } return; }
  if (event.code === 'KeyE') { if (paused) { paused = false; overlay('#pause-menu', false); } inventoryOpen = !inventoryOpen; overlay('#inventory-screen', inventoryOpen); return; }
  if (event.code === 'Enter') { chatOpen = true; overlay('#chat-screen', true); document.querySelector('#chat-input').focus(); return; }
  if (paused || inventoryOpen) return;
  if (event.code.startsWith('Digit')) {
    const number = Number(event.code.slice(5));
    if (number >= 1 && number <= 9) { selectedSlot = number - 1; renderHotbar(); }
  }
  if (event.code === 'KeyW') { const now = performance.now(); if (now - lastW < 300) player.sprint = !player.sprint; lastW = now; }
  pressed.add(event.code);
  held.add(event.code);
});
addEventListener('keyup', (event) => { held.delete(event.code); pressed.delete(event.code); });
addEventListener('blur', () => { held.clear(); pressed.clear(); });
document.querySelector('#pause-button').addEventListener('click', () => { paused = !paused; overlay('#pause-menu', paused); });
document.querySelector('#resume-button').addEventListener('click', () => { paused = false; overlay('#pause-menu', false); });
document.querySelector('#inventory-button').addEventListener('click', () => { paused = false; overlay('#pause-menu', false); inventoryOpen = true; overlay('#inventory-screen', true); });
document.querySelector('#save-button').addEventListener('click', () => { paused = false; overlay('#pause-menu', false); showToast('World saved locally'); });
document.querySelector('[data-close]').addEventListener('click', () => { inventoryOpen = false; overlay('#inventory-screen', false); });

function update(delta) {
  if (paused || inventoryOpen || chatOpen) return;
  const turn = delta * 1.65;
  if (held.has('ArrowLeft')) player.yaw += turn;
  if (held.has('ArrowRight')) player.yaw -= turn;
  if (held.has('ArrowUp')) player.pitch = Math.min(1.35, player.pitch + turn);
  if (held.has('ArrowDown')) player.pitch = Math.max(-1.35, player.pitch - turn);
  const forward = Number(held.has('KeyW')) - Number(held.has('KeyS'));
  const strafe = Number(held.has('KeyD')) - Number(held.has('KeyA'));
  const speed = player.sprint ? 8 : held.has('ShiftLeft') ? 2 : 4.7;
  const dx = (-Math.sin(player.yaw) * forward + Math.cos(player.yaw) * strafe) * speed * delta;
  const dz = (-Math.cos(player.yaw) * forward - Math.sin(player.yaw) * strafe) * speed * delta;
  const nx = player.x + dx, nz = player.z + dz;
  const floor = Math.max(heightAt(Math.round(nx), Math.round(nz)) + 1.7, 1.8);
  const bodyBottom = Math.floor(player.y - 1.7) + 1;
  const collides = (x, z) => Boolean(blockMap.get(blockKey(x, bodyBottom, z)) || blockMap.get(blockKey(x, bodyBottom + 1, z)));
  if (!collides(nx, player.z)) player.x = nx;
  if (!collides(player.x, nz)) player.z = nz;
  if (pressed.has('Space') && player.grounded) player.velocityY = 7.5;
  player.velocityY -= 20 * delta;
  player.y += player.velocityY * delta;
  if (player.y <= floor) { player.y = floor; player.velocityY = 0; player.grounded = true; } else player.grounded = false;
  if (held.has('KeyQ')) mine();
  if (pressed.has('KeyR')) place();
  player.x = THREE.MathUtils.clamp(player.x, -16.5, 16.5);
  player.z = THREE.MathUtils.clamp(player.z, -16.5, 16.5);
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  document.querySelector('#coordinates').textContent = `${Math.floor(player.x)}, ${Math.floor(player.z)}`;
  pressed.clear();
}
function frame(now) {
  requestAnimationFrame(frame);
  const delta = Math.min((now - lastFrame) / 1000, .05);
  lastFrame = now;
  update(delta);
  updateTarget();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});