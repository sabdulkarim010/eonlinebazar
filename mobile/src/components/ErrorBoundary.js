import { Component } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.warn('App ErrorBoundary', error, info?.componentStack);
    SplashScreen.hideAsync().catch((hideError) => {
      console.warn('SplashScreen.hideAsync failed', hideError);
    });
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            {this.state.error?.message || 'The app hit an unexpected error on launch.'}
          </Text>
          <Pressable onPress={this.handleRetry} style={styles.button}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#131921',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    color: '#d5d9d9',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 10,
  },
  button: {
    marginTop: 20,
    backgroundColor: '#ffd814',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
  },
});
