/* eslint-disable react/prop-types */
import FailRestartHint from "./ReactComponents/FailRestartHint";
import HeroDemo from "./ReactComponents/HeroDemo";
import PassFireworks from "./ReactComponents/PassFireworks";
import StageControls from "./ReactComponents/StageControls";
import SummitObjectiveMedal from "./ReactComponents/SummitObjectiveMedal";
import SummitPayout from "./ReactComponents/SummitPayout";

export default function ReactUI({
  from = 0,
  to = from,
  fromDay = from,
  toDay = to,
  claimAlreadyDone = false,
}) {
  return (
    <>
      <HeroDemo />
      <SummitObjectiveMedal />
      <FailRestartHint />
      <PassFireworks />
      <SummitPayout />
      <StageControls
        fromDay={fromDay}
        toDay={toDay}
        claimAlreadyDone={claimAlreadyDone}
      />
    </>
  );
}
