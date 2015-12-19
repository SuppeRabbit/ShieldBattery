import React from 'react'
import { connect } from 'react-redux'
import siteSocket from './network/site-socket'

import AppBar from './material/app-bar.jsx'
import Divider from './material/left-nav/divider.jsx'
import Entry from './material/left-nav/entry.jsx'
import FontIcon from './material/font-icon.jsx'
import LeftNav from './material/left-nav/left-nav.jsx'
import Section from './material/left-nav/section.jsx'
import Subheader from './material/left-nav/subheader.jsx'

function stateToProps(state) {
  return {
    auth: state.auth,
    chatChannels: [
      { name: '#doyoureallywantthem' },
      { name: '#teamliquid', active: true },
      { name: '#x17' },
      { name: '#nohunters' },
    ],
    whispers: [
      { from: 'Pachi' },
    ],
  }
}

@connect(stateToProps)
class MainLayout extends React.Component {
  componentDidMount() {
    siteSocket.connect()
  }

  componentWillUnmount() {
    siteSocket.disconnect()
  }

  render() {
    const channels = this.props.chatChannels.map(
        channel => <Entry key={channel.name} active={channel.active}>{channel.name}</Entry>)
    const whispers = this.props.whispers.map(
        whisper => <Entry key={whisper.from} active={whisper.active}>{whisper.from}</Entry>)
    return (<div className='flex-row'>
      <LeftNav>
        <Subheader>Chat channels</Subheader>
        <Section>
          {channels}
          <Entry>
            <FontIcon>add_circle</FontIcon>
            <span>Join another</span>
          </Entry>
        </Section>
        <Divider/>
        <Subheader>Whispers</Subheader>
        <Section>
          {whispers}
        </Section>
      </LeftNav>
      <div className='flex-fit'>
        <AppBar title='#teamliquid'/>
        { this.props.children }
      </div>
    </div>)
  }
}

export default MainLayout
