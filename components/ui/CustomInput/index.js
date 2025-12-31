import React from 'react';
import { styles } from './styles';
import { Controller } from 'react-hook-form';
export default function CustomInput({control, name,rules={}, secureTextEntry, placeholder, keyboardType}){
    return(
            <Controller
                // placeholderTextColor={placeholderTextColor}
                control={control}
                name={name}
                keyboardType={keyboardType}
                rules={rules}
                render={({ field : {value, onChange, onBlur}, fieldState: {error}}) => (
                        <>
                            <input 
                                style={[styles.Container, {borderColor: error? '#ff2c2c' : 'none'}]}
                                value={value}
                                onChangeText={onChange}
                                onBlur={onBlur}
                                secureTextEntry={secureTextEntry}
                                placeholder={placeholder}
                             />
                             {error && (
                                <div style={styles.Error_banner}>
                                    <p style={styles.Errors}>{error.message || 'error'}</p>
                                </div>
                             )}
                        </>
                    )} 
            />
    );
};
