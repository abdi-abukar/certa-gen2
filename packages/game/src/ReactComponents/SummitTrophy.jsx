import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { awardModelUrl } from "../award-model-url";
import {
  addDashboardAwardLights,
  attachAwardEnvironment,
  configureAwardRenderer,
  applyTrophyFinish,
  frameAward,
} from "../award-render";

export default function SummitTrophy() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    configureAwardRenderer(renderer);
    addDashboardAwardLights(scene);
    const detachEnv = attachAwardEnvironment(renderer, scene);

    let model = null;
    let frameId = 0;
    let lastTime = 0;

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
    loader.load(awardModelUrl("trophy.glb"), (gltf) => {
      model = gltf.scene.clone(true);
      applyTrophyFinish(model);
      scene.add(model);
      frameAward(camera, model);
    });

    const render = (time) => {
      const delta = lastTime ? Math.min(0.05, (time - lastTime) / 1000) : 0;
      lastTime = time;
      if (model) {
        model.rotation.y += delta * 0.55;
      }
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      detachEnv();
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
      aria-label="Summit trophy"
      className="summit-award"
      ref={canvasRef}
    />
  );
}
