import { Pressable, Image } from 'react-native'
import React from 'react';
// import { Pressable } from 'react-native';
import { globals } from './styles';

export default function CustomBackButton({onPress}){
    return(
        <Pressable onPress={onPress} style={globals.Container}>
            <Image source={require('../../../assets/media/left.png')} style={globals.BackButtonImage} />
        </Pressable>
    );
}
