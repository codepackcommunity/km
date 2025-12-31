import { Text, Pressable } from 'react-native'
import React from 'react';
// import { Pressable } from 'react-native';
import { globals } from './styles';

export default function CustomSecondaryButton({onPress, text, type="Secondary"}){
    return(
        <Pressable onPress={onPress} style={[globals.Container, globals.Container_Secondary]}>
            <Text style={globals.Text}>{text}</Text>
        </Pressable>
    );
}
