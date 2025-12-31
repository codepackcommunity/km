import {StyleSheet} from 'react-native';
export const styles = StyleSheet.create({
 Container:{
  width: '80%',
  height: 50,
  justifyContent: 'center',
  alignContent: 'center',
  marginVertical: '2%',
  backgroundColor: '#f1f1f1',
  paddingLeft: 10,
  // borderWidth: 2,
  // borderColor: '#f1f1f1',
  borderRadius: 8,
  color: "#111"
 },
 Error_banner:{
   width: '70%',
   height: 40,
   display: 'flex',
   justifyContent: 'flex-start',
   alignItems: 'flex-start',
 },
 Errors:{
    color: 'red',
    // alignSelf: 'stretch',
 }
});
