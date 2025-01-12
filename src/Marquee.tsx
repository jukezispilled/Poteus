import React from 'react';
import Marquee from 'react-fast-marquee';

const MarqueeComponent: React.FC = () => {
  return (
    <div style={{ backgroundColor: 'red', color: 'white', padding: '10px' }}>
      <Marquee className="font-semibold text-2xl" speed={70} pauseOnHover gradient={false} loop={0}>
        BREAKING: Microsoft Unveils Immortalized Kanye AI Called "YEI"! EXCLUSIVE: YEI Sparks Controversy Over Copyright and Creativity! DRAMA: Is the World Ready for an Eternal Kanye? INSIDER REPORTS: YEI to Drop Its First Album—"808s and Eternity"! SHOCKING: Critics Question the Ethics of Kanye's Immortality!&nbsp;
      </Marquee>
    </div>
  );
};

export default MarqueeComponent;