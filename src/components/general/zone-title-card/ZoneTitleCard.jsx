
import React, { useState, useEffect, useContext } from 'react';
import classnames from 'classnames';

import {RenderMirror} from './RenderMirror';
import {RainFx} from './RainFx';
import { AppContext } from '../../app';

import styles from './zone-title-card.module.css';

//

const logoImages = [
  'images/logos/upstreet1.png',
  'images/logos/upstreet2.png',
  'images/logos/upstreet3.png',
];

export const ZoneTitleCard = () => {

    const { app } = useContext( AppContext );
    const [ open, setOpen ] = useState( true );
    const [ logoImage, setLogoImage ] = useState( logoImages[Math.floor(Math.random() * logoImages.length)] );
    const [ loadProgress, setLoadProgress ] = useState( false );
    const [ fullLoaded, setFullLoaded ]= useState( false );

    useEffect(() => {
        function loadingscreenopen(e) {
            const {isOpen} = e.data;
            if (isOpen !== undefined) {
                setOpen(isOpen)
            }
        }
        function webaverseloaded (e) {
            const {isLoaded} = e.data;
            setFullLoaded(isLoaded)
        }
        function loadingscreenprogress(e) {
            const {progress} = e.data;
            if (progress !== undefined) {
                let loadProgress = (progress / 100) % 1
                if (progress === 100) loadProgress = 1
                setLoadProgress(loadProgress)
            }
        }
        app.addEventListener('loadingscreenopen', loadingscreenopen);
        app.addEventListener('webaverseloaded', webaverseloaded);
        app.addEventListener('loadingscreenprogress', loadingscreenprogress);
        return () => {
            app.removeEventListener('loadingscreenopen', loadingscreenopen);
            app.removeEventListener('webaverseloaded', webaverseloaded);
            app.removeEventListener('loadingscreenprogress', loadingscreenprogress);
        };
    }, []);

    const title = 'Webaverse';
    const description = 'Zone Description';
    const comment = 'This is a zone comment.';

    return (
        <div className={ classnames(styles.zoneTitleCard, open ? styles.open : null) } >
            <div className={ styles.leftWing }>
                <div className={ styles.block }>
                    {/* <div className={ styles.title }>Webaverse</div> */}
                    <img className={ styles.logoImage } src={ logoImage } />
                </div>
                <img className={ styles.tailImg } src="images/snake-tongue.svg" />
            </div>
            <div className={ styles.rightSection }>
                {
                   <RenderMirror app={app} width={128} enabled={open && fullLoaded} />
                }
                <div className={ styles.title }>
                    <div className={ styles.background } />
                    <div className={ styles.text }>{title}</div>
                </div>
                <div className={ styles.description }>
                    <div className={ styles.background } />
                    <div className={ styles.text }>{description}</div>
                </div>
                <div className={ styles.comment }>{comment}</div>
            </div>
            <div className={ styles.bottomSection }>
                <div className={ styles.loadingBar }>
                    <div className={ styles.label }>Loading</div>
                    <progress className={ styles.loadProgress } value={loadProgress} />
                    <img src="images/loading-bar.svg" className={ styles.loadProgressImage } />
                </div>
            </div>

            <RainFx app={app} enabled={open} />
        </div>
    );

};
