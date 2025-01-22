import React from 'react';
import Marquee from 'react-fast-marquee';

const MarqueeComponent: React.FC = () => {
  return (
    <div style={{ backgroundColor: '#D1B28E', color: 'white', padding: '10px' }}>
      <Marquee className="font-semibold text-2xl" speed={70} pauseOnHover gradient={false} loop={0}>
        BREAKING: Microsoft Unveils Immortalized Trump AI Named "Doneus Maximus"! EXCLUSIVE: Doneus Maximus Raises Questions About AI and Human Identity! DRAMA: Is the World Ready for an Eternal Trump? INSIDER REPORTS: Doneus Maximus to Drop Its First Album—"MAGA Millions"! SHOCKING: Critics Question the Ethics of Trump's Immortality!&nbsp;
      </Marquee>
    </div>
  );
};

export default MarqueeComponent;