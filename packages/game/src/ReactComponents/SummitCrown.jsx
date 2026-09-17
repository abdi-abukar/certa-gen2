import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { awardModelUrl } from "../award-model-url";

export default function SummitCrown() {
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
    renderer.toneMappingExposure = 1.3;

    scene.add(new THREE.HemisphereLight(0xfff6dc, 0x3a2810, 2.8));

    const keyLight = new THREE.DirectionalLight(0xffffff, 6);
    keyLight.position.set(4, 5, 7);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffd878, 2.6);
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
    loader.load(awardModelUrl("crown.glb"), (gltf) => {
      model = gltf.scene.clone(true);

      model.traverse((child) => {
        if (!child.isMesh) return;
        child.material = new THREE.MeshStandardMaterial({
          color: "#d6a83a",
          metalness: 0.86,
          roughness: 0.2,
        });
        child.castShadow = false;
        child.receiveShadow = false;
      });

      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const largestSide = Math.max(size.x, size.y, size.z);

      model.position.sub(center);
      model.rotation.y = -0.28;
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
        model.rotation.y = -0.28 + Math.sin(time * 0.00075) * (Math.PI / 14);
        model.rotation.z = Math.sin(time * 0.0011) * 0.02;
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
      aria-label="Recurring payout crown"
      className="summit-award"
      ref={canvasRef}
    />
  );
}
