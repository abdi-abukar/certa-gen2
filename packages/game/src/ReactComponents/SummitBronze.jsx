import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { awardModelUrl } from "../award-model-url";

const BRONZE = new THREE.Color("#c9783a");

export default function SummitBronze() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    scene.add(new THREE.HemisphereLight(0xfff4e8, 0x3a2418, 2.6));

    const keyLight = new THREE.DirectionalLight(0xffe8cc, 5.4);
    keyLight.position.set(4, 5, 7);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffb070, 2.2);
    rimLight.position.set(-5, 2, -4);
    scene.add(rimLight);

    let model = null;
    let frameId = 0;

    const resize = () => {
      const width = Math.max(canvas.clientWidth, 1);
      const height = Math.max(canvas.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const loader = new GLTFLoader();
    loader.load(awardModelUrl("bronze.glb"), (gltf) => {
      model = gltf.scene.clone(true);

      model.traverse((child) => {
        if (!child.isMesh) return;
        child.material = new THREE.MeshStandardMaterial({
          color: BRONZE,
          metalness: 0.82,
          roughness: 0.28,
        });
        child.castShadow = false;
        child.receiveShadow = false;
      });

      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const largestSide = Math.max(size.x, size.y, size.z);

      model.position.sub(center);
      scene.add(model);

      camera.position.set(
        largestSide * 0.82,
        largestSide * 0.34,
        largestSide * 2.1,
      );
      camera.lookAt(0, 0, 0);
    });

    const render = (time) => {
      if (model) {
        model.rotation.y = Math.sin(time * 0.00075) * (Math.PI / 12);
        model.rotation.z = Math.sin(time * 0.0011) * 0.03;
      }
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      scene.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      aria-label="Bronze payout medal"
      className="summit-award"
      ref={canvasRef}
    />
  );
}
