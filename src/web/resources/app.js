'use strict';

const App = () => {
    const [projects, setProjects] = React.useState([
        { name: 'Spilnu.dk' },
        { name: 'PlayerAccount' }
    ]);

    return (
        <div>
            <h1>Gitlab CI</h1>
            { projects.map((project, index) => (
                <p key={index}>{project.name}</p>
            )) }
        </div>
    );
};

const domContainer = document.querySelector('#gci-app');
ReactDOM.render(React.createElement(App), domContainer);
