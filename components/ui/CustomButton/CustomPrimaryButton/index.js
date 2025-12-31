import { View, Text, Pressable } from 'react-native'
import React from 'react';
// import { Pressable } from 'react-native';
import { globals } from './styles';

export default function CustomButton({onPress, text, type="Primary", disabled}){
    return(
        <Pressable 
         disabled={disabled}
         onPress={onPress}
         style={[globals.Container, globals.Container_Primary]}>
            <Text style={globals.Text}>{text}</Text>
        </Pressable>
    );
}
