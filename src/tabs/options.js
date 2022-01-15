import React from 'react';
import {useState} from 'react';
import classnames from 'classnames';
import styles from '../Header.module.css';
import {Tab} from '../components/tab';

export const Options = ({app, open, toggleOpen, panelsRef}) => {
  const [avatarStyle, setAvatarStyle] = useState(4);

  return (
    <Tab
      type="options"
      onclick={async e => {
        toggleOpen('options')
      }}
      top
      right
      index={1}
      label={
        <div className={styles.label}>
          <img src="images/webpencil.svg" className={classnames(styles.background, styles.blue)} />
          <span className={styles.text}>オプション Option</span>
        </div>
      }
      panels={[
        (<div className={styles.panel} key="left">
          <div className={styles['panel-header']}>
            <h1>Options</h1>
          </div>
          <h2>Avatar style</h2>
          <input type="range" min={1} max={4} step={1} value={avatarStyle} onChange={e => setAvatarStyle(parseInt(e.target.value, 10))} className={styles['slider']} />
          <p className={styles['description']}>
            {
              (() => {
                switch (avatarStyle) {
                  case 1: {
                    return (<>
                      <b>1 - Sprite sheet</b>
                      <span>Pixels on a plane. A fast style of avatar! One draw call, one texture.<br/>(^_~)</span>
                    </>);
                  }
                  case 2: {
                    return (<>
                      <b>2 - Optimized avatar</b>
                      <span>Squash algorithm. One draw call w/atlas uv! Maybe loses some shade (눈_눈)</span>
                    </>);
                  }
                  case 3: {
                    return (<>
                      <b>3 - Standard avatar</b>
                      <span>Standard GLB avatar render. High quality materials if u wk hard<br/>__〆(￣ー￣ )</span>
                    </>);
                  }
                  case 4: {
                    return (<>
                      <b>4 - VRM MToon avatar</b>
                      <span>The highest level to aspire. Full MToon effects enabled blows the Unreal Engine Phyonx™!</span>
                    </>);
                  }
                  default:
                    return null;
                }
              })()
            }
          </p>
        </div>),
        /* (selectedApp ? <div className={styles.panel} key="right">
          <div className={styles['panel-header']}>
            <div className={classnames(styles.button, styles.back)} onClick={e => {
              e.preventDefault();
              e.stopPropagation();

              setSelectedApp(null);
            }}>
              <img src="images/webchevron.svg" className={styles.img} />
            </div>
            <h1>{_formatContentId(selectedApp.contentId)}</h1>
          </div>
          <div className={styles['panel-subheader']}>Position</div>
          <div className={styles.inputs}>
            <NumberInput input={px} />
            <NumberInput input={py} />
            <NumberInput input={pz} />
          </div>
          <div className={styles['panel-subheader']}>Rotation</div>
          <div className={styles.inputs}>
            <NumberInput input={rx} />
            <NumberInput input={ry} />
            <NumberInput input={rz} />
          </div>
          <div className={styles['panel-subheader']}>Scale</div>
          <div className={styles.inputs}>
            <NumberInput input={sx} />
            <NumberInput input={sy} />
            <NumberInput input={sz} />
          </div>
        </div> : null), */
      ]}
      open={open}
      toggleOpen={toggleOpen}
      panelsRef={panelsRef}
    />
  );
};
