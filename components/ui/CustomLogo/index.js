import React from 'react';
import { Image, useWindowDimensions } from 'react-native'
import { styles } from './styles';

export default function CustomLogo(){
    const {height} = useWindowDimensions();
    return(
        <Image  
            source={require('../../assets/src/Abochi.png')}
            style={[styles.Container, {height: height * 0.3 }]} 
        />
    );
}
