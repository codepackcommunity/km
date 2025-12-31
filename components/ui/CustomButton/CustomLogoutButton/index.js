import { View, Text, Pressable } from 'react-native'
import React from 'react';
// import { Pressable } from 'react-native';
import { globals } from './styles';

export default function CustomLoginButton({onPress, text, type="Primary"}){
    return(
        <Pressable onPress={onPress} style={[globals.Container, globals.Container_Primary]}>
            <Text style={globals.Text}>{text}</Text>
        </Pressable>
    );
}
