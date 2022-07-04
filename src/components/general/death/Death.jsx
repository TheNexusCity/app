import React, { useEffect, useState } from "react";
import classnames from "classnames";
import styles from "./death.module.css";
import metaversefile from "metaversefile";
import ioManager from "../../../../io-manager";
import { RainFx } from "./RainFx";

export const Death = () => {
  const [isDeath, setIsDeath] = useState(false);

  useEffect(() => {
    const onSetLive = (e) => {
      setIsDeath(!e.data.isLive);
    };
    ioManager.addEventListener("setLive", onSetLive);
    return () => {
      ioManager.removeEventListener("setLive", onSetLive);
    };
  });

  return (
    <div className={classnames(styles.Death, isDeath && styles.open)}>
      <div>YOU HAVE DIED</div>
      <div>Press "RESPAWN" TO CONTINUE</div>
      <div
        className={styles.respawn}
        onClick={() => {
          const localPlayer = metaversefile.useLocalPlayer();
          localPlayer.setLive(true);
          setIsDeath(false);
        }}
      >
        RESPAWN
      </div>
      <RainFx enabled={isDeath}></RainFx>
    </div>
  );
};
