import "./CertaMastheadBrand.css";
import art from "./assets/certa-masthead-brand.png";
export default function CertaMastheadBrand({className=""}) {
  return <div className={`certa-masthead-brand ${className}`} aria-hidden="true">
    <img className="certa-masthead-brand__image" src={art} alt="" />
  </div>;
}