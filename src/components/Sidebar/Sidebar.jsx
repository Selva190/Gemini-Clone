import React, { useContext } from 'react'
import './Sidebar.css'
import { assets } from "../../assets/assets";
import { Context } from "../../context/Context.jsx";


const Sidebar = () => {

   const [extended, setExtended] = React.useState(false);
   const { onSent, prevPrompts, setRecentPrompt,newChat } = useContext(Context);

   const loadPrompt = async (prompt) => {
      if (!prompt) return;
      setRecentPrompt(prompt);
      await onSent(prompt);
   };


  return (
    <div className='sidebar'>
        <div className="top">
            <img onClick={() => setExtended(prev => !prev)} className="menu" src={assets.menu_icon} alt="" />
            <div onClick={() => newChat()} className="new-chat">
                <img src={assets.plus_icon} alt="" />
                {extended ? <p>New chat</p> : null}
            </div>
            {extended ? (
                <div className="recent">
                    <p className="recent-title">Recent</p>
                    {prevPrompts && prevPrompts.length > 0 ? (
                        prevPrompts.map((item, index) => {
                            return (
                                <div
                                    className="recent-entry"
                                    key={index}
                                    onClick={() => loadPrompt(item)}
                                >
                                    <img src={assets.message_icon} alt="" />
                                    <p>{(item || "").slice(0, 30)}{(item || "").length > 30 ? "..." : ""}</p>
                                </div>
                            );
                        })
                    ) : (
                        <div className="recent-entry">
                            <img src={assets.message_icon} alt="" />
                            <p>No history</p>
                        </div>
                    )}
                </div>
            ) : null}
            
        </div>
        <div className="bottom">
        <div className="bottom-item recent-entry">
            <img src={assets.question_icon} alt="" />
            {extended ? <p>Help</p> : null}
        </div>
        <div className="bottom-item recent-entry">
            <img src={assets.history_icon} alt="" />
            {extended ? <p>Activity</p> : null}
        </div>
        <div className="bottom-item recent-entry">
            <img src={assets.setting_icon} alt="" />
            {extended ? <p>Settings</p> : null}
        </div>
    </div>
    </div>
  )
}

export default Sidebar