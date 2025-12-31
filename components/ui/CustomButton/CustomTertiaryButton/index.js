import { View, Text, Pressable } from 'react-native'
import React from 'react';
// import { Pressable } from 'react-native';
import { globals } from './styles';

export default function CustomTertiaryButton({onPress, text, type="Tertiary"}){
    return(
        <Pressable onPress={onPress} style={[globals.Container, globals.Container_Tertiary]}>
            <Text style={globals.Text}>{text}</Text>
        </Pressable>
    );
}
